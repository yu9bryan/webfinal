#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import requests
from bs4 import BeautifulSoup
import urllib.parse
import time
import random
import re
import os
import pandas as pd

# ==============================================
# 常數與設定
# ==============================================
BASE_URL       = "https://www.techpowerup.com"
SEARCH_URL     = f"{BASE_URL}/gpu-specs/"
USER_AGENTS    = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
]

# 如果未來要把結果存到 CSV，可以自行修改這裡
OUTPUT_CSV = "gpu_selected_details.csv"
COLUMNS = [
    "brand",
    "name",
    "release_year",
    "launch_price",
    "pixel_rate",
    "texture_rate",
    "fp16",
    "fp32",
    "fp64",
    "memory_size",
    "source_url"
]

# ==============================================
# 幫助函式：安全 GET，內含重試機制
# ==============================================
def safe_get(url: str, max_retries: int = 8) -> requests.Response | None:
    backoff = 2.0
    for attempt in range(max_retries):
        headers = {
            "User-Agent": random.choice(USER_AGENTS),
            "Referer": f"{SEARCH_URL}",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8",
        }
        try:
            resp = requests.get(url, headers=headers, timeout=15)
            # 如果被 Rate‐limit (429)，就等待並重試
            if resp.status_code == 429:
                print(f"  → {url} 回傳 429，等待 {backoff:.1f} 秒後重試…")
                time.sleep(backoff)
                backoff *= 4
                continue
            resp.raise_for_status()
            return resp
        except requests.exceptions.RequestException as e:
            wait = backoff + random.uniform(0, 1)
            print(f"  → {url} 請求錯誤 ({e})，等待 {wait:.1f} 秒後重試…")
            time.sleep(wait)
            backoff = min(backoff * 2, 64)
    return None

# ==============================================
# 步驟 1：抓取 AJAX 搜尋結果（列出所有符合條件的 GPU 名稱 + URL）
# ==============================================
def fetch_gpu_search_html(keyword: str) -> str:
    """
    透過 AJAX 端點，帶上關鍵字去拿回 HTML 片段：
    GET https://www.techpowerup.com/gpu-specs/?ajaxsrch=<keyword>

    回傳伺服器回來的 HTML 原始字串 (fragment)
    """
    params = {"ajaxsrch": keyword}
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Referer": SEARCH_URL + "?sort=name"
    }
    try:
        resp = requests.get(SEARCH_URL, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        raise RuntimeError(f"取得 AJAX 搜尋結果失敗: {e}")

def parse_ajax_results(html_fragment: str) -> list[dict]:
    """
    將 AJAX 回傳的 HTML 片段解析成 list，其中每個元素是：
    {
      "name": "<GPU 名稱>",
      "url":  "<detail page 完整 URL>",
      "cols": ["列 0 的文字", "列 1 的文字", ...]
    }
    """
    soup = BeautifulSoup(html_fragment, "lxml")
    table = soup.find("table")
    if table:
        tbody = table.find("tbody")
        rows = tbody.find_all("tr") if tbody else table.find_all("tr")
    else:
        rows = soup.find_all("tr")

    results = []
    for tr in rows:
        cols = [td.get_text(strip=True) for td in tr.find_all("td")]
        if not cols:
            continue
        a_tag = tr.find("a", href=True)
        if a_tag:
            href = a_tag["href"].strip()
            detail_url = urllib.parse.urljoin(BASE_URL, href)
            name = a_tag.get_text(strip=True)
        else:
            detail_url = None
            continue
        results.append({
            "name": name,
            "url": detail_url,
            "cols": cols
        })
    return results

# ==============================================
# 步驟 2：列印簡易清單並讓使用者選擇
# ==============================================
def print_search_list(parsed: list[dict]) -> None:
    """
    parsed: list of {"name": ..., "url": ..., "cols": [...]}
    將所有匹配的 GPU 列出並編號，格式示例：
      [1] NVIDIA GeForce RTX 3080 → https://...
      [2] Radeon RX 9060 XT 8 GB → https://...
      ...
    """
    if not parsed:
        print("找不到任何匹配的 GPU。")
        return
    print("=== 搜尋結果清單 (編號 → 名稱) ===")
    for idx, entry in enumerate(parsed, start=1):
        print(f"[{idx}] {entry['name']} → {entry['url']}")
    print()

def prompt_user_selection(total: int, parsed: list[dict], auto_mode: bool = False) -> list[int]:
    """
    提示使用者輸入要抓哪幾筆的編號，僅檢查數字範圍。
    如果 auto_mode 設為 True，則自動選擇所有結果。
    """
    # 自動模式：選擇所有結果
    if auto_mode:
        print(f"自動模式已啟用：選擇全部 {total} 個結果")
        return list(range(1, total + 1))
    
    # 互動模式：等待使用者輸入
    while True:
        sel = input(f"請輸入要擷取的編號 (1 ~ {total})，可用逗號或中橫號 (e.g. 1,3 或 2-4)：").strip()
        if not sel:
            print("請至少輸入一個編號。")
            continue
        chosen = set()
        parts = re.split(r"\s*,\s*", sel)
        ok = True
        for p in parts:
            if "-" in p:
                a, b = p.split("-", 1)
                if not (a.isdigit() and b.isdigit()):
                    ok = False
                    break
                a, b = int(a), int(b)
                if a < 1 or b < 1 or a > total or b > total or a > b:
                    ok = False
                    break
                for i in range(a, b+1):
                    chosen.add(i)
            else:
                if not p.isdigit():
                    ok = False
                    break
                i = int(p)
                if i < 1 or i > total:
                    ok = False
                    break
                chosen.add(i)
        if not ok:
            print("輸入格式錯誤，請重新輸入。")
            continue
        return sorted(chosen)

# ==============================================
# 步驟 3：抓取單支 GPU Detail Page，並解析 Specifications
# （參考並直接使用你提供的 parse_gpu_page 與 fetch_detail_specs）
# ==============================================
def parse_gpu_page(url: str) -> dict | None:
    """
    由你提供的程式，解析單張 GPU 詳細頁面的關鍵欄位：
    回傳 dict，欄位包含：
      brand, name, release_year, launch_price, pixel_rate, texture_rate,
      fp16, fp32, fp64, memory_size, source_url
    """
    resp = safe_get(url)
    if not resp:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    result = {
        "brand": None,
        "name": None,
        "release_year": None,
        "launch_price": None,
        "pixel_rate": None,
        "texture_rate": None,
        "fp16": None,
        "fp32": None,
        "fp64": None,
        "memory_size": None,
        "source_url": url
    }

    # 1. 先抓 <h1 class="gpudb-name">，例如 "NVIDIA GeForce RTX 3080"
    h1 = soup.find("h1", class_="gpudb-name")
    if not h1:
        return None
    name_text = h1.text.strip()
    result["name"] = name_text
    brand = name_text.split()[0]
    if brand not in ("NVIDIA", "AMD"):
        return None
    result["brand"] = brand

    # 2. 找到各個 <h2> 標題，並取出後面對應的 <div>
    sections: dict[str, BeautifulSoup] = {}
    for h2 in soup.find_all("h2"):
        title = h2.text.strip()
        sib = h2.find_next_sibling()
        while sib and sib.name != "div":
            sib = sib.find_next_sibling()
        if sib and sib.name == "div":
            sections[title] = sib

    # 3. 解析 "Theoretical Performance" 區域
    tp_div = sections.get("Theoretical Performance")
    if tp_div:
        for dl in tp_div.find_all("dl", class_="clearfix"):
            dt = dl.find("dt")
            dd = dl.find("dd")
            if not dt or not dd:
                continue
            key = dt.text.strip()
            val = dd.text.strip()
            if key == "Pixel Rate":
                result["pixel_rate"] = val
            elif key == "Texture Rate":
                result["texture_rate"] = val
            elif key.startswith("FP16"):
                result["fp16"] = val
            elif key.startswith("FP32"):
                result["fp32"] = val
            elif key.startswith("FP64"):
                result["fp64"] = val

    # 4. 解析 "Memory" 區域
    mem_div = sections.get("Memory")
    if mem_div:
        for dl in mem_div.find_all("dl", class_="clearfix"):
            dt = dl.find("dt")
            dd = dl.find("dd")
            if not dt or not dd:
                continue
            if dt.text.strip() == "Memory Size":
                result["memory_size"] = dd.text.strip()

    # 5. 解析 "Graphics Card" 區域（Release Date 與 Launch Price）
    gc_div = sections.get("Graphics Card")
    if gc_div:
        for dl in gc_div.find_all("dl", class_="clearfix"):
            dt = dl.find("dt")
            dd = dl.find("dd")
            if not dt or not dd:
                continue
            key = dt.text.strip()
            val = dd.text.strip()
            if key == "Release Date":
                m = re.search(r"(\d{4})", val)
                if m:
                    result["release_year"] = int(m.group(1))
            elif key == "Launch Price":
                pm = re.search(r"(\d+)", val.replace(",", ""))
                if pm:
                    result["launch_price"] = int(pm.group(1))

    return result

# ==============================================
# 步驟 4：抓取 Specifications 用的函式 (如果需要額外解析 Specs 表格，也可以自行寫)
# 這裡直接示範把上面 parse_gpu_page 回傳的欄位印出。如果要更細粒度的 Specs，
# 可以再寫一個 fetch_detail_specs(url) 來抓 <table class="...table-vertical"> 那張表。
# ==============================================
def fetch_detail_specs(url: str) -> dict:
    """
    如果你要完全抓 Specs 表格，可以仿照前面示範 fetch_detail_specs，
    但此處示範只呼叫 parse_gpu_page()，抓主要欄位即可。
    """
    return parse_gpu_page(url)  # 你只要 parse_gpu_page 就可以抓到大部分細節

# ==============================================
# 主程式
# ==============================================
def main():
    # 1. 檢查參數
    if len(sys.argv) < 2:
        print("用法: python gpu_search_select.py <關鍵字> [選項]")
        print("選項:")
        print("  --auto            自動選擇所有結果")
        print("  --list-only       僅列出結果，不進行抓取")
        print("  --select=1,2,5-8  選擇特定編號的結果進行抓取")
        print("範例: python gpu_search_select.py \"RTX 3080\"")
        print("範例: python gpu_search_select.py \"RTX 3080\" --auto")
        print("範例: python gpu_search_select.py \"RTX 3080\" --list-only")
        print("範例: python gpu_search_select.py \"RTX 3080\" --select=1,3,5-7")
        sys.exit(1)

    keyword = sys.argv[1].strip()
    if not keyword:
        print("請提供非空的搜尋關鍵字。")
        sys.exit(1)
        
    # 檢查命令行選項
    auto_mode = False
    list_only_mode = False
    selected_indices = []
    
    for i in range(2, len(sys.argv)):
        arg = sys.argv[i]
        if arg == "--auto":
            auto_mode = True
        elif arg == "--list-only":
            list_only_mode = True
        elif arg.startswith("--select="):
            selection = arg[9:]  # 取出 --select= 後面的部分
            try:
                parts = re.split(r"\s*,\s*", selection)
                for p in parts:
                    if "-" in p:
                        a, b = p.split("-", 1)
                        a, b = int(a), int(b)
                        for j in range(a, b+1):
                            selected_indices.append(j)
                    else:
                        selected_indices.append(int(p))
                selected_indices = sorted(set(selected_indices))  # 去重並排序
            except ValueError:
                print("選擇格式錯誤，請使用如 --select=1,3,5-7 的格式")
                sys.exit(1)

    # 2. 先抓 AJAX 搜尋結果
    try:
        html_fragment = fetch_gpu_search_html(keyword)
    except Exception as e:
        print(f"取得搜尋結果失敗: {e}")
        sys.exit(1)

    # 3. 解析出所有符合條件的 GPU 條目
    parsed = parse_ajax_results(html_fragment)
    if not parsed:
        print("找不到任何匹配的 GPU，程式結束。")
        sys.exit(0)    # 4. 列印搜尋結果清單
    print_search_list(parsed)
    
    # 根據模式決定下一步操作
    if list_only_mode:
        # 僅列出結果，不進行抓取
        print("僅列出搜尋結果模式，不進行抓取。")
        sys.exit(0)
        
    # 確定選擇的索引
    if selected_indices:
        # 使用命令行指定的索引
        indices = []
        for i in selected_indices:
            if 1 <= i <= len(parsed):
                indices.append(i)
            else:
                print(f"警告：索引 {i} 超出範圍，已忽略")
        
        if not indices:
            print("沒有有效的索引被選擇，程式結束。")
            sys.exit(0)
    else:
        # 使用互動式選擇或自動模式
        indices = prompt_user_selection(len(parsed), parsed, auto_mode)
        
    print(f"你選擇了以下編號：{indices}")

    # 5. 針對每個選到的索引 (1-based) 去抓取詳細資料並印出
    selected_entries = [parsed[i - 1] for i in indices]
    specs_all = []

    for idx, entry in enumerate(selected_entries, start=1):
        gpu_name = entry["name"]
        detail_url = entry["url"]
        print(f"\n[{idx}/{len(selected_entries)}] {gpu_name}：正在抓取詳細頁面 → {detail_url}")

        data = fetch_detail_specs(detail_url)
        if data:
            # 這裡再次檢查品牌
            brand = data.get("brand", "")
            if brand not in ("NVIDIA", "AMD", "Intel"):
                print(f"  → 不支援的品牌: {brand if brand else '未知'}，跳過。")
                continue
            specs_all.append(data)
            # 把結果簡單印出
            print(f"  抓到以下欄位：")
            for k, v in data.items():
                print(f"    {k}: {v}")
        else:
            print(f"  → 抓取失敗或解析不到資訊，請手動查看：{detail_url}")

        # 為了避免連續請求過快，加點隨機延遲
        time.sleep(0.5 + random.random() * 0.5)

    # 6. （選用）如果要把 specs_all 寫到 CSV
    if specs_all:
        try:
            df = pd.DataFrame(specs_all, columns=COLUMNS)
            df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
            print(f"\n已將選取的詳細資料寫入 {OUTPUT_CSV}")
        except Exception as e:
            print(f"寫入 CSV 出錯：{e}")

if __name__ == "__main__":
    main()
