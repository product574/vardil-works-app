import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT

# Step 2 (decision 64): Team chat, option C. What the AI picked out of the firm's Teams or Slack,
# laid out like Email: Needs action, Passed to me, Done and each channel; tag, pass on, approve
# and post the drafted reply, or mark it done; the chat app switch in Admin, Connections.
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(350)
def as_role(page, name):
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name=name).click(); page.wait_for_timeout(400)
def items(page):
    return page.locator("main ul[aria-label$='messages'] > li")
def side_count(page, label):
    link = page.locator("nav[aria-label='Team chat screens']:visible a", has_text=label).first
    t = link.inner_text().replace(label, "").strip()
    return int(t) if t.isdigit() else 0

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    page.wait_for_selector("text=AI overview"); page.wait_for_timeout(300)
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)

    # ── The bar and the sidebar
    bar = [t.strip() for t in page.locator("nav[aria-label='Departments'] a").all_inner_texts()]
    check("Team chat sits right of Email in the bar", bar[:3] == ["Dashboard", "Email", "Team chat"], bar[:4])
    go(page, "/chat")
    side = page.locator("nav[aria-label='Team chat screens']:visible")
    check("Sidebar: the three views, then every channel by its Teams name", side.get_by_role("link", name="Needs action").count() == 1 and side.get_by_role("link", name="Done").count() == 1 and side.locator("a", has_text="C720 Ardmullen House").count() == 1 and side.locator("a", has_text="Plant and yard").count() == 1)
    heights = side.locator("a").evaluate_all("els => els.map(e => e.getBoundingClientRect().height)")
    check("Long channel names stay on one line in the sidebar", max(heights) <= 37, heights)
    page.screenshot(path=f"{OUT}/200-chat-needs-action.png")

    # ── Needs action against the records
    open_n = data(page, "db.chatMessages.filter(m => m.action && m.action.status === 'Open').length")
    check("Needs action lists every open message", items(page).count() == open_n and open_n >= 6, (items(page).count(), open_n))
    check("Sidebar count matches", side_count(page, "Needs action") == open_n, side_count(page, "Needs action"))
    times = data(page, "db.chatMessages.filter(m => m.action && m.action.status === 'Open').map(m => m.at).sort().reverse()")
    first = items(page).first.inner_text()
    check("Newest first: the tender question from Colm at 09:05", "Colm Henebry" in first and "09:05" in first and "Decision" in first and times[0].endswith("09:05:00"), first)
    check("Each row: tag, channel and who it went to", "Office" in first and "Aidan, reply drafted" in first, first)
    check("The first message opens by itself", main.get_by_role("list", name="Conversation").count() == 1)
    check("It says why it went to that person", main.locator("text=Decisions only a director can make go to Aidan King, managing director.").count() == 1)
    check("Conversation shows the message before it in the channel", main.get_by_role("list", name="Conversation").locator("li", has_text="Safe Pass").count() == 1)
    seg = page.get_by_role("tablist", name="Channels shown")
    seg.get_by_role("tab", name="Sites").click(); page.wait_for_timeout(200)
    check("Sites shows only site channels", all("Office" not in t and "Accounts" not in t.split("\n")[-1] for t in items(page).all_inner_texts()) and items(page).count() == data(page, "db.chatMessages.filter(m => m.action && m.action.status === 'Open' && db.chatChannels.find(c => c.id === m.channelId).projectId).length"))
    seg.get_by_role("tab", name="All").click(); page.wait_for_timeout(200)

    # ── Passed to me
    go(page, "/chat/mine")
    mine = data(page, "db.chatMessages.filter(m => m.action && m.action.status === 'Open' && m.action.toId === 'p-md').length")
    check("Passed to me holds only the managing director's", items(page).count() == mine == 1 and side_count(page, "Passed to me") == 1, (items(page).count(), mine))

    # ── Open one, retag and pass it on
    go(page, "/chat")
    items(page).filter(has_text="Neighbour at the back").click(); page.wait_for_timeout(300)
    check("A complaint names the project and its contracts manager", main.locator("text=Complaints on C722 go to Aisling Rafter, who runs it as contracts manager.").count() == 1)
    check("The project is one click away", main.get_by_role("link", name="C722 Dunmoy Courthouse").count() == 1)
    main.get_by_label("Passed to").select_option("p-hs"); page.wait_for_timeout(300)
    check("Passing it on: saved, and says who passed it", data(page, "db.chatMessages.find(m => m.text.startsWith('Neighbour')).action.toId") == "p-hs" and main.locator("text=Aidan King passed it to Declan Furey.").count() == 1)
    main.get_by_label("Tag").select_option("Safety"); page.wait_for_timeout(300)
    check("Retagging is saved and keeps who it went to", data(page, "db.chatMessages.find(m => m.text.startsWith('Neighbour')).action") .get("tag") == "Safety" and data(page, "db.chatMessages.find(m => m.text.startsWith('Neighbour')).action.toId") == "p-hs")

    # ── Edit the draft, approve and post
    items(page).filter(has_text="DH1 is not keeping up").click(); page.wait_for_timeout(300)
    box = main.get_by_label("Reply in C720 Ardmullen House, as Pat Scully")
    check("Plant goes to Pat Scully with his reply drafted", box.count() == 1 and "DH2 is in the yard" in box.input_value())
    box.fill("Cathal, DH2 goes out on the van first thing tomorrow."); page.wait_for_timeout(200)
    main.get_by_role("button", name="Approve and post").click(); page.wait_for_timeout(400)
    reply = data(page, "(() => { const m = db.chatMessages.find(x => x.text.startsWith('DH1')); return { a: m.action, r: db.chatMessages.find(x => x.replyTo === m.id) }; })()")
    check("Posting puts the edited reply in the channel as Pat", reply["r"] and reply["r"]["authorId"] == "p-yard" and reply["r"]["text"] == "Cathal, DH2 goes out on the van first thing tomorrow.", reply)
    check("and closes it as replied, by the approver, with the draft used up", reply["a"]["status"] == "Done" and reply["a"]["outcome"] == "Replied" and reply["a"]["resolvedBy"] == "Aidan King" and "draft" not in reply["a"], reply["a"])
    check("It leaves Needs action", items(page).count() == open_n - 1 and side_count(page, "Needs action") == open_n - 1)

    # ── Mark done, then back
    items(page).filter(has_text="fuel card").click(); page.wait_for_timeout(300)
    main.get_by_role("button", name="Mark done, no reply").click(); page.wait_for_timeout(400)
    check("Mark done closes it with nothing posted", data(page, "(() => { const m = db.chatMessages.find(x => x.text.includes('fuel card')); return m.action.outcome === 'Done without reply' && !db.chatMessages.some(x => x.replyTo === m.id); })()"))
    go(page, "/chat/done")
    check("Done holds both, newest first", items(page).count() == 5 and "fuel card" in items(page).first.inner_text() or "DH1" in items(page).first.inner_text(), items(page).all_inner_texts()[:2])
    items(page).filter(has_text="DH1 is not keeping up").click(); page.wait_for_timeout(300)
    check("A replied one shows the reply under it, posted from here, and cannot be reopened", main.get_by_role("list", name="Conversation").locator("li", has_text="posted from here").count() == 1 and main.get_by_role("button", name="Move back to Needs action").count() == 0)
    items(page).filter(has_text="fuel card").click(); page.wait_for_timeout(300)
    main.get_by_role("button", name="Move back to Needs action").click(); page.wait_for_timeout(400)
    check("A closed one goes back to Needs action", data(page, "db.chatMessages.find(x => x.text.includes('fuel card')).action.status") == "Open")
    page.screenshot(path=f"{OUT}/201-chat-done.png")

    # ── A channel
    go(page, "/chat/channel/ch-C720")
    check("A channel lists what was picked out of it, open first", [t.split("\n")[0] for t in items(page).all_inner_texts()] == ["Cathal Minogue", "Cathal Minogue"] and "Replied" in items(page).last.inner_text(), items(page).all_inner_texts())
    check("A site channel links to its project", main.get_by_role("link", name="Open C720").count() == 1)
    go(page, "/chat/channel/nope")
    check("An unknown channel says so", main.locator("text=This channel is not here").count() == 1)

    # ── Activity log
    go(page, "/admin/activity")
    for what in ["Posted a reply in Team chat", "Passed a Team chat message on", "Marked a Team chat message done", "Changed a Team chat message's tag", "Moved a Team chat message back to Needs action"]:
        check(f"Activity log: {what}", main.locator(f"text={what}").count() >= 1)

    # ── Teams or Slack
    go(page, "/admin/connections")
    check("Connections lists Microsoft Teams", main.locator("td", has_text="Microsoft Teams").count() == 1)
    page.get_by_role("tablist", name="Team chat app").get_by_role("tab", name="Slack").click(); page.wait_for_timeout(300)
    check("Switching to Slack changes the row", main.locator("td", has_text="Slack").count() == 1 and main.locator("td", has_text="Microsoft Teams").count() == 0)
    go(page, "/chat")
    side = page.locator("nav[aria-label='Team chat screens']:visible")
    check("Slack channel names in the sidebar and the list", side.locator("a", has_text="#c720-ardmullen-house").count() == 1 and "#office" in items(page).first.inner_text())
    check("The note names Slack", main.locator("text=stays in Slack").count() == 1)
    page.screenshot(path=f"{OUT}/202-chat-slack.png")
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)
    go(page, "/chat")
    check("The chat app is a preference: it survives a reset", side.locator("a", has_text="#office").count() == 1)
    go(page, "/admin/connections")
    page.get_by_role("tablist", name="Team chat app").get_by_role("tab", name="Microsoft Teams").click(); page.wait_for_timeout(300)

    # ── Who has it
    as_role(page, "Contracts manager")
    check("A contracts manager has Team chat", page.locator("nav[aria-label='Departments'] a", has_text="Team chat").count() == 1)
    go(page, "/chat/mine")
    tadhg = data(page, "db.chatMessages.filter(m => m.action && m.action.status === 'Open' && m.action.toId === 'p-cm1').length")
    check("Tadhg sees his own in Passed to me", items(page).count() == tadhg >= 2, (items(page).count(), tadhg))
    as_role(page, "Site manager")
    check("A site manager does not have Team chat yet", page.locator("nav[aria-label='Departments'] a", has_text="Team chat").count() == 0)
    as_role(page, "Managing director")

    # ── Phone and dark
    page.set_viewport_size({"width": 390, "height": 844})
    go(page, "/chat")
    sw = page.evaluate("document.documentElement.scrollWidth")
    check("Phone width: no sideways scroll", sw <= 390, sw)
    page.screenshot(path=f"{OUT}/203-chat-phone.png", full_page=True)
    page.set_viewport_size({"width": 1440, "height": 900})
    page.get_by_role("button", name="Switch to dark mode").click(); page.wait_for_timeout(200)
    go(page, "/chat"); page.screenshot(path=f"{OUT}/204-chat-dark.png")
    page.get_by_role("button", name="Switch to light mode").click()

errs = []
try:
    errs = run(steps)
except Exception as e:
    print("STOPPED EARLY:", str(e).split("\n")[0])
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
