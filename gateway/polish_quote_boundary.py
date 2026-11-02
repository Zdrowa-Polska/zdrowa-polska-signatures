"""Recognize verified Polish Gmail quote attributions without weakening opt-out."""
import ast
import inspect
import re

LEGACY_FUNCTION = "def plain_current_end(body):\n    quote = re.search(r'(?im)^(?:>|On .+wrote:|W dniu .+napisał|Dnia .+napisał|У .+писав|.+пише:|.+написал:|[-]{2,}\\s*(?:Forwarded|Original|Wiadomość|Переслане))', body)\n    return quote.start() if quote else len(body)"

def plain_current_end(body):
    quote = re.search(r'(?im)^(?:>|On .+wrote:|W dniu .+napisał|Dnia .+napisał|У .+писав|.+пише:|.+написал:|[-]{2,}\s*(?:Forwarded|Original|Wiadomość|Переслане))', body)
    end = quote.start() if quote else len(body)
    # Polish Gmail wraps the sender address onto a second line. Include its
    # dated attribution in the quoted history, rather than the signature suffix.
    # Require a dated weekday, time, email, attribution and a following line break.
    polish = re.compile(
        r'(?im)^(?:pn|pon|wt|śr|czw|pt|sob|nd|niedz|пн|вт|ср|чт|пт|сб|нд)\.?,?[^\S\r\n]+'
        r'\d{1,2}[^\S\r\n]+[^\W\d_]+\.?[^\S\r\n]+\d{4}(?:[^\S\r\n]*[rр]\.)?[^\S\r\n]+[oо][^\S\r\n]+\d{1,2}:\d{2}[^\S\r\n]+'
        r'[^\r\n]*(?:\r?\n[^\r\n]*){0,2}?(?:napisał(?:\(a\)|a)?|pisze|пише|написав|написала)[^\S\r\n]*:'
        r'[^\S\r\n]*(?:\r?\n[^\S\r\n]*)+')
    for attribution in polish.finditer(body):
        if re.search(r'[\w.+-]+@[\w.-]+\.[\w-]+', attribution.group()):
            end = min(end, attribution.start())
            break
    return end


PREVIOUS_FUNCTION = "def plain_current_end(body):\n    quote = re.search(r'(?im)^(?:>|On .+wrote:|W dniu .+napisał|Dnia .+napisał|У .+писав|.+пише:|.+написал:|[-]{2,}\\s*(?:Forwarded|Original|Wiadomość|Переслане))', body)\n    end = quote.start() if quote else len(body)\n    # Polish Gmail wraps the sender address onto a second line. Include its\n    # dated attribution in the quoted history, rather than the signature suffix.\n    # Require a dated weekday, time, email, attribution and a following line break.\n    polish = re.compile(\n        r'(?im)^(?:pon|wt|śr|czw|pt|sob|niedz)\\.,?[ \\t]+'\n        r'\\d{1,2}[ \\t]+[^\\W\\d_]+[ \\t]+\\d{4}[ \\t]+o[ \\t]+\\d{1,2}:\\d{2}[ \\t]+'\n        r'[^\\r\\n]*(?:\\r?\\n[^\\r\\n]*){0,2}?napisał(?:\\(a\\)|a)?[ \\t]*:'\n        r'[ \\t]*(?:\\r?\\n[ \\t]*)+')\n    for attribution in polish.finditer(body):\n        if re.search(r'[\\w.+-]+@[\\w.-]+\\.[\\w-]+', attribution.group()):\n            end = min(end, attribution.start())\n            break\n    return end"

def patch_source(source):
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "plain_current_end")
    current = ast.get_source_segment(source, node)
    updated = inspect.getsource(plain_current_end).rstrip()
    if current == updated:
        return source
    if current not in (LEGACY_FUNCTION, PREVIOUS_FUNCTION):
        raise ValueError("Live plain quote parser differs from the tested anchor")
    return source.replace(current, updated, 1)
