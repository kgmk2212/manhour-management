#!/usr/bin/env python3
"""
バックアップJSON → 要約JSON変換スクリプト

工数管理アプリのバックアップJSONを読み込み、
LLM推論用の要約JSONに変換する。
"""

import json
import argparse
import sys
from datetime import datetime, date
from collections import defaultdict
from pathlib import Path


def load_backup(path: str) -> dict:
    """バックアップJSONを読み込む"""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def calc_accuracy(estimate: float, actual: float) -> float:
    """精度(%)を計算"""
    if estimate == 0:
        return 0.0
    return round(actual / estimate * 100, 1)


def get_working_days_per_month() -> int:
    """月あたり営業日数（デフォルト20日）"""
    return 20


def get_hours_per_day() -> int:
    """1日あたり勤務時間"""
    return 8


def summarize_overall(estimates: list, actuals: list) -> dict:
    """全体集計"""
    total_estimate = sum(e.get("hours", 0) for e in estimates)
    total_actual = sum(a.get("hours", 0) for a in actuals)

    overrun_tasks = set()
    underrun_tasks = set()

    # タスク×工程ごとに集計
    task_estimates = defaultdict(float)
    task_actuals = defaultdict(float)

    for e in estimates:
        key = (e.get("version", ""), e.get("task", ""), e.get("process", ""))
        task_estimates[key] += e.get("hours", 0)

    for a in actuals:
        key = (a.get("version", ""), a.get("task", ""), a.get("process", ""))
        task_actuals[key] += a.get("hours", 0)

    for key, est in task_estimates.items():
        act = task_actuals.get(key, 0)
        if est > 0:
            ratio = act / est
            if ratio > 1.2:
                overrun_tasks.add(key)
            elif ratio < 0.8:
                underrun_tasks.add(key)

    return {
        "total_estimate_hours": round(total_estimate, 1),
        "total_actual_hours": round(total_actual, 1),
        "accuracy_percent": calc_accuracy(total_estimate, total_actual),
        "total_tasks": len(task_estimates),
        "overrun_tasks": len(overrun_tasks),
        "underrun_tasks": len(underrun_tasks),
    }


def summarize_by_version(estimates: list, actuals: list, remaining: list) -> list:
    """バージョン別集計"""
    versions = sorted(set(e.get("version", "") for e in estimates))
    result = []

    for ver in versions:
        ver_est = [e for e in estimates if e.get("version") == ver]
        ver_act = [a for a in actuals if a.get("version") == ver]
        ver_rem = [r for r in remaining if r.get("version") == ver]

        est_hours = sum(e.get("hours", 0) for e in ver_est)
        act_hours = sum(a.get("hours", 0) for a in ver_act)
        rem_hours = sum(r.get("remainingHours", 0) for r in ver_rem)

        # タスク数
        tasks = set(
            (e.get("task", ""), e.get("process", "")) for e in ver_est
        )

        # 完了判定: 残見積が0のタスク
        completed_tasks = set()
        for t_key in tasks:
            task_rem = [
                r
                for r in ver_rem
                if r.get("task") == t_key[0] and r.get("process") == t_key[1]
            ]
            if not task_rem or all(
                r.get("remainingHours", 0) == 0 for r in task_rem
            ):
                # 実績がある場合のみ完了とみなす
                task_act = [
                    a
                    for a in ver_act
                    if a.get("task") == t_key[0] and a.get("process") == t_key[1]
                ]
                if task_act:
                    completed_tasks.add(t_key)

        # 超過タスク
        overrun_count = 0
        worst_overrun = None
        worst_overrun_pct = 0

        for t_key in tasks:
            t_est = sum(
                e.get("hours", 0)
                for e in ver_est
                if e.get("task") == t_key[0] and e.get("process") == t_key[1]
            )
            t_act = sum(
                a.get("hours", 0)
                for a in ver_act
                if a.get("task") == t_key[0] and a.get("process") == t_key[1]
            )
            if t_est > 0 and t_act / t_est > 1.2:
                overrun_count += 1
                pct = round((t_act / t_est - 1) * 100, 1)
                if pct > worst_overrun_pct:
                    worst_overrun_pct = pct
                    worst_overrun = {
                        "task": t_key[0],
                        "process": t_key[1],
                        "overrun_percent": pct,
                    }

        is_completed = rem_hours == 0 and len(completed_tasks) == len(tasks) and len(tasks) > 0
        eac = act_hours + rem_hours

        entry = {
            "version": ver,
            "status": "completed" if is_completed else "in_progress",
            "estimate_hours": round(est_hours, 1),
            "actual_hours": round(act_hours, 1),
            "accuracy_percent": calc_accuracy(est_hours, act_hours),
            "tasks": len(tasks),
            "completed_tasks": len(completed_tasks),
            "overrun_tasks_count": overrun_count,
        }

        if not is_completed:
            entry["remaining_hours"] = round(rem_hours, 1)
            entry["eac"] = round(eac, 1)
            progress = (act_hours / eac * 100) if eac > 0 else 0
            entry["progress_rate"] = round(progress, 1)

        if worst_overrun:
            entry["worst_overrun"] = worst_overrun

        result.append(entry)

    return result


def summarize_by_process(estimates: list, actuals: list) -> list:
    """工程別集計"""
    processes = ["UI", "PG", "PT", "IT", "ST"]
    result = []

    for proc in processes:
        est = sum(
            e.get("hours", 0) for e in estimates if e.get("process") == proc
        )
        act = sum(
            a.get("hours", 0) for a in actuals if a.get("process") == proc
        )
        if est > 0 or act > 0:
            result.append(
                {
                    "process": proc,
                    "estimate": round(est, 1),
                    "actual": round(act, 1),
                    "accuracy": calc_accuracy(est, act),
                }
            )

    return result


def summarize_by_member(estimates: list, actuals: list) -> list:
    """メンバー別集計"""
    members = sorted(set(e.get("member", "") for e in estimates if e.get("member")))
    result = []

    for member in members:
        m_est = [e for e in estimates if e.get("member") == member]
        m_act = [a for a in actuals if a.get("member") == member]

        est_hours = sum(e.get("hours", 0) for e in m_est)
        act_hours = sum(a.get("hours", 0) for a in m_act)

        # 工程別精度
        process_accuracy = {}
        for proc in ["UI", "PG", "PT", "IT", "ST"]:
            p_est = sum(
                e.get("hours", 0) for e in m_est if e.get("process") == proc
            )
            p_act = sum(
                a.get("hours", 0) for a in m_act if a.get("process") == proc
            )
            if p_est > 0:
                process_accuracy[proc] = calc_accuracy(p_est, p_act)

        strong = min(process_accuracy, key=lambda k: abs(process_accuracy[k] - 100)) if process_accuracy else None
        weak = max(process_accuracy, key=lambda k: abs(process_accuracy[k] - 100)) if process_accuracy else None

        task_count = len(
            set((e.get("task", ""), e.get("process", "")) for e in m_est)
        )

        entry = {
            "name": member,
            "estimate": round(est_hours, 1),
            "actual": round(act_hours, 1),
            "accuracy": calc_accuracy(est_hours, act_hours),
            "task_count": task_count,
        }
        if strong:
            entry["strong_process"] = strong
        if weak and weak != strong:
            entry["weak_process"] = weak

        result.append(entry)

    return result


def summarize_monthly_trend(estimates: list, actuals: list) -> list:
    """月次トレンド"""
    # 実績を月ごとに集計
    monthly_actual = defaultdict(float)
    for a in actuals:
        d = a.get("date", "")
        if len(d) >= 7:
            month = d[:7]  # YYYY-MM
            monthly_actual[month] += a.get("hours", 0)

    # 見積を月ごとに集計
    monthly_estimate = defaultdict(float)
    for e in estimates:
        # monthlyHoursがあればそちらを使用
        monthly_hours = e.get("monthlyHours", {})
        if monthly_hours:
            for month, hours in monthly_hours.items():
                monthly_estimate[month] += hours
        else:
            month = e.get("workMonth", "")
            if month:
                monthly_estimate[month] += e.get("hours", 0)

    all_months = sorted(set(list(monthly_estimate.keys()) + list(monthly_actual.keys())))
    current_month = date.today().strftime("%Y-%m")

    result = []
    for month in all_months:
        est = monthly_estimate.get(month, 0)
        act = monthly_actual.get(month, 0)
        entry = {
            "month": month,
            "estimate": round(est, 1),
            "actual": round(act, 1),
            "accuracy": calc_accuracy(est, act),
        }
        if month == current_month:
            entry["in_progress"] = True
        result.append(entry)

    return result


def summarize_member_monthly(estimates: list, actuals: list) -> list:
    """メンバー別月別工数"""
    members = sorted(set(e.get("member", "") for e in estimates if e.get("member")))
    member_monthly_est = defaultdict(lambda: defaultdict(float))
    member_monthly_act = defaultdict(lambda: defaultdict(float))

    for e in estimates:
        member = e.get("member", "")
        monthly_hours = e.get("monthlyHours", {})
        if monthly_hours:
            for month, hours in monthly_hours.items():
                member_monthly_est[member][month] += hours
        else:
            month = e.get("workMonth", "")
            if month:
                member_monthly_est[member][month] += e.get("hours", 0)

    for a in actuals:
        member = a.get("member", "")
        d = a.get("date", "")
        if len(d) >= 7:
            month = d[:7]
            member_monthly_act[member][month] += a.get("hours", 0)

    all_months = sorted(set(
        list(k for m in member_monthly_est.values() for k in m.keys()) +
        list(k for m in member_monthly_act.values() for k in m.keys())
    ))

    hours_per_day = get_hours_per_day()
    working_days = get_working_days_per_month()
    standard = hours_per_day * working_days  # 1人あたり月間標準工数

    result = []
    for member in members:
        months = []
        for month in all_months:
            est = member_monthly_est[member].get(month, 0)
            act = member_monthly_act[member].get(month, 0)
            if est > 0 or act > 0:
                entry = {
                    "month": month,
                    "estimate": round(est, 1),
                    "actual": round(act, 1),
                }
                if est > standard * 0.9:
                    entry["high_load"] = True
                months.append(entry)
        total_est = sum(m["estimate"] for m in months)
        total_act = sum(m["actual"] for m in months)
        result.append({
            "name": member,
            "total_estimate": round(total_est, 1),
            "total_actual": round(total_act, 1),
            "months": months,
        })

    return result


def summarize_task_sizes(estimates: list) -> list:
    """タスクサイズ分布（大タスクのリスク可視化）"""
    task_hours = defaultdict(float)
    task_meta = {}

    for e in estimates:
        key = (e.get("version", ""), e.get("task", ""))
        task_hours[key] += e.get("hours", 0)
        if key not in task_meta:
            task_meta[key] = e.get("member", "")

    tasks = []
    for key, hours in task_hours.items():
        tasks.append({
            "version": key[0],
            "task": key[1],
            "total_estimate": round(hours, 1),
            "primary_member": task_meta.get(key, ""),
        })

    tasks.sort(key=lambda x: x["total_estimate"], reverse=True)
    return tasks


def summarize_capacity(estimates: list, members: list) -> dict:
    """キャパシティ分析（月別）"""
    working_days = get_working_days_per_month()
    hours_per_day = get_hours_per_day()
    headcount = len(members) if members else 1
    standard_hours = working_days * hours_per_day * headcount

    # 月別の見積合計
    monthly_estimate = defaultdict(float)
    for e in estimates:
        monthly_hours = e.get("monthlyHours", {})
        if monthly_hours:
            for month, hours in monthly_hours.items():
                monthly_estimate[month] += hours
        else:
            month = e.get("workMonth", "")
            if month:
                monthly_estimate[month] += e.get("hours", 0)

    months = []
    for month in sorted(monthly_estimate.keys()):
        est = monthly_estimate[month]
        utilization = round(est / standard_hours * 100, 1) if standard_hours > 0 else 0
        entry = {
            "month": month,
            "estimate": round(est, 1),
            "utilization_percent": utilization,
        }
        if utilization > 90:
            entry["warning"] = "high"
        months.append(entry)

    return {
        "working_days_per_month": working_days,
        "hours_per_day": hours_per_day,
        "headcount": headcount,
        "standard_hours_per_month": standard_hours,
        "monthly": months,
    }


def detect_anomalies(estimates: list, actuals: list, threshold: float = 1.2) -> list:
    """異常値検出（超過率20%以上）"""
    task_estimates = defaultdict(float)
    task_actuals = defaultdict(float)
    task_versions = {}

    for e in estimates:
        key = (e.get("task", ""), e.get("process", ""))
        task_estimates[key] += e.get("hours", 0)
        task_versions[key] = e.get("version", "")

    for a in actuals:
        key = (a.get("task", ""), a.get("process", ""))
        task_actuals[key] += a.get("hours", 0)
        if key not in task_versions:
            task_versions[key] = a.get("version", "")

    anomalies = []
    for key, est in task_estimates.items():
        act = task_actuals.get(key, 0)
        if est > 0 and act / est >= threshold:
            overrun_pct = round((act / est - 1) * 100, 1)
            anomalies.append(
                {
                    "version": task_versions.get(key, ""),
                    "task": key[0],
                    "process": key[1],
                    "estimate": round(est, 1),
                    "actual": round(act, 1),
                    "overrun_percent": overrun_pct,
                }
            )

    return sorted(anomalies, key=lambda x: x["overrun_percent"], reverse=True)


def summarize(backup: dict) -> dict:
    """バックアップJSONを要約JSONに変換"""
    estimates = backup.get("estimates", [])
    actuals = backup.get("actuals", [])
    remaining = backup.get("remainingEstimates", [])

    members = sorted(set(e.get("member", "") for e in estimates if e.get("member")))

    summary = {
        "generated_at": datetime.now().isoformat(),
        "source_version": backup.get("version", "unknown"),
        "overall": summarize_overall(estimates, actuals),
        "by_version": summarize_by_version(estimates, actuals, remaining),
        "by_process": summarize_by_process(estimates, actuals),
        "by_member": summarize_by_member(estimates, actuals),
        "member_monthly": summarize_member_monthly(estimates, actuals),
        "task_sizes": summarize_task_sizes(estimates),
        "monthly_trend": summarize_monthly_trend(estimates, actuals),
        "capacity": summarize_capacity(estimates, members),
        "anomalies": detect_anomalies(estimates, actuals),
    }

    return summary


def main():
    parser = argparse.ArgumentParser(description="バックアップJSON → 要約JSON変換")
    parser.add_argument("--input", "-i", required=True, help="バックアップJSONファイルのパス")
    parser.add_argument("--output", "-o", default=None, help="出力先（省略時は標準出力）")
    args = parser.parse_args()

    backup = load_backup(args.input)
    summary = summarize(backup)

    output_json = json.dumps(summary, ensure_ascii=False, indent=2)

    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        print(f"要約JSONを出力しました: {args.output}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
