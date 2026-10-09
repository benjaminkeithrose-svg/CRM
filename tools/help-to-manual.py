# Regenerates MANUAL.md from the Help screen in index.html (s-help), so the two
# carry the same words. Run from the repo root: python3 tools/help-to-manual.py
import re, html
src=open('index.html').read()
i=src.index('<section class="scr" id="s-help">'); j=src.index('</section>', i)
sec=src[i:j]
def inline(t):
    t=re.sub(r'<b>(.*?)</b>', r'**\1**', t, flags=re.S)
    t=re.sub(r'<[^>]+>','',t)
    t=html.unescape(t)
    return re.sub(r'\s+',' ',t).strip()
out=["# Field CRM — help", "",
"The same help is inside the app: tap **⋯** at the top right of Home, then **Help**. It works with no signal. If you change one, change the other.", "",
"Plan the week on the PC. Do the calls on the phone. Cloud sync keeps the two in step.", ""]
for part in re.split(r'(<h2>.*?</h2>)', sec)[1:]:
    if part.startswith('<h2>'):
        out += ["---", "", "## " + inline(part), ""]; continue
    for d in re.findall(r'<details class="sx hx">(.*?)</details>', part, re.S):
        out += ["### " + inline(re.search(r'<summary><b>(.*?)</b>',d,re.S).group(1)), ""]
        body=d.split('</summary>',1)[1]
        for m in re.finditer(r'<ol>(.*?)</ol>|<p>(.*?)</p>', body, re.S):
            if m.group(1):
                for n,li in enumerate(re.findall(r'<li>(.*?)</li>', m.group(1), re.S),1):
                    out.append(f"{n}. {inline(li)}")
                out.append("")
            else:
                out += [inline(m.group(2)), ""]
out += ["---", "", "## Two things to remember", "",
"**Never put an export, a backup or the zone overrides file in the GitHub repository.** It's public. Customer data lives on your devices and, encrypted, in your own cloud project.", "",
"**The passphrase can't be recovered.** Keep it in your password manager."]
open('MANUAL.md','w').write("\n".join(out).rstrip()+"\n")
