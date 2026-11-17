import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT

# Team chat, laid out like Ping in the reference demos (16 Nov, Oisin): channels and direct
# messages in a side panel, the conversation under day lines, a message box with @mentions and a
# file, unread counts, Teams or Slack names, and who sees which channels.
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(400)
def as_role(page, name):
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name=name).click(); page.wait_for_timeout(500)
def bar_label(page, name):
    return page.locator("nav[aria-label='Departments'] a", has_text=name)

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)

    # ── The bar and the side panel
    bar = [t.strip().split("\n")[-1] for t in page.locator("nav[aria-label='Departments'] a").all_inner_texts()]
    check("Team chat sits right of Email in the bar", bar[:3] == ["Dashboard", "Email", "Team chat"], bar[:4])
    unread = data(page, "(() => { let n = 0; for (const c of db.chatChannels) if (c.memberIds.includes('p-md')) n += db.chatMessages.filter(m => m.channelId === c.id && m.authorId !== 'p-md' && m.at > (c.lastRead['p-md'] || '')).length; return n; })()")
    check("The bar shows the unread count on Team chat", bar_label(page, "Team chat").inner_text().strip().startswith(str(unread)) and unread > 0, (bar_label(page, "Team chat").inner_text(), unread))
    go(page, "/chat", "main h1")
    side = page.get_by_role("navigation", name="Channels and direct messages")
    check("Side panel: Team chat in Microsoft Teams, then Group chats, then Direct messages", "Microsoft Teams" in main.inner_text() and "Group chats" in side.inner_text() and "Direct messages" in side.inner_text())
    check("Group chats go by name alone, with no #", "#" not in side.inner_text() and "#" not in main.get_by_role("heading").first.inner_text())
    chans = data(page, "db.chatChannels.filter(c => c.kind === 'channel' && c.memberIds.includes('p-md')).length")
    dms = data(page, "db.chatChannels.filter(c => c.kind === 'dm' && c.memberIds.includes('p-md')).length")
    check("Every channel and direct message the managing director is in", side.get_by_role("link").count() == chans + dms and chans == 10 and dms == 3, (side.get_by_role("link").count(), chans, dms))
    check("A direct message is named after the other person", side.get_by_role("link", name="Tadhg Morrissey").count() == 1)
    heights = side.get_by_role("link").evaluate_all("els => els.map(e => e.getBoundingClientRect().height)")
    check("Long channel names stay on one line", heights and max(heights) <= 41, heights)
    check("/chat opens the first channel on a computer", main.get_by_role("heading", name="C719 St Finian's Church").count() == 1)
    page.screenshot(path=f"{OUT}/200-chat.png")

    # ── A channel
    go(page, "/chat/ch-C720", "main h1")
    log = main.get_by_role("log")
    check("Header: the channel name, a link to its project, and its members", main.get_by_role("heading", name="C720 Ardmullen House").count() == 1 and main.get_by_role("link", name="Open C720").count() == 1 and main.get_by_role("button", name="6 members").count() == 1)
    check("Messages under day lines, oldest first", log.get_by_role("separator").count() == 2 and log.get_by_role("separator").last.get_attribute("aria-label") == "Today" and "Cathal Minogue" in log.locator("li").first.inner_text())
    check("An @mention shows in bold", log.locator("strong", has_text="@Cathal Minogue").count() >= 1)
    check("Opening it marks it read", data(page, "(() => { const c = db.chatChannels.find(c => c.id === 'ch-C720'); const last = db.chatMessages.filter(m => m.channelId === 'ch-C720').map(m => m.at).sort().pop(); return c.lastRead['p-md'] >= last; })()"))
    main.get_by_role("button", name="6 members").click(); page.wait_for_timeout(200)
    check("Members list with each person's job", "Cathal Minogue" in page.inner_text("body") and "Site manager" in page.inner_text("body") and "Site team and office for Ardmullen House" in page.inner_text("body"))
    page.keyboard.press("Escape"); page.wait_for_timeout(150)

    # ── Writing: @mention, a file, Enter to send
    box = main.get_by_label("Message C720 Ardmullen House")
    check("The message box says what it does", box.get_attribute("placeholder") == "Type a message... Use @ to mention")
    check("Send is off until there is something to send", main.get_by_role("button", name="Send message").is_disabled())
    box.click(); page.keyboard.type("Thanks @Ca", delay=10); page.wait_for_timeout(200)
    opts = page.get_by_role("listbox", name="People to mention").get_by_role("option")
    check("@ offers the members whose name matches", opts.count() == 1 and "Cathal Minogue" in opts.first.inner_text())
    page.keyboard.press("Enter"); page.wait_for_timeout(150)
    check("Enter picks the name and the box keeps it", box.input_value() == "Thanks @Cathal Minogue ")
    page.keyboard.type("DH2 is booked for tomorrow.", delay=5)
    main.locator("input[type=file]").set_input_files({"name": "drawing-room.jpg", "mimeType": "image/jpeg", "buffer": b"\xff\xd8\xff\xd9"}); page.wait_for_timeout(200)
    check("A file waits beside the box and can be taken off", "drawing-room.jpg" in main.inner_text() and main.get_by_role("button", name="Remove the file").count() == 1)
    box.click(); page.keyboard.press("End"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    last = data(page, "db.chatMessages.filter(m => m.channelId === 'ch-C720').slice(-1)[0]")
    check("Enter sends it as the signed-in person, with the file", last["authorId"] == "p-md" and last["text"] == "Thanks @Cathal Minogue DH2 is booked for tomorrow." and last.get("attachment") == "drawing-room.jpg", last)
    check("It shows at the bottom and the box empties", "DH2 is booked for tomorrow." in log.locator("li").last.inner_text() and "drawing-room.jpg" in log.locator("li").last.inner_text() and box.input_value() == "", (log.locator("li").last.inner_text(), box.input_value()))
    box.click(); page.keyboard.type("line one"); page.keyboard.press("Shift+Enter"); page.keyboard.type("line two"); page.wait_for_timeout(100)
    check("Shift and Enter starts a new line instead of sending", box.input_value() == "line one\nline two")
    main.get_by_role("button", name="Send message").click(); page.wait_for_timeout(300)
    check("The send button sends too", data(page, "db.chatMessages.filter(m => m.channelId === 'ch-C720').slice(-1)[0].text") == "line one\nline two")
    page.screenshot(path=f"{OUT}/201-chat-channel.png")

    # ── Unread counts
    office = side.get_by_role("link", name="Office")
    n_office = data(page, "db.chatMessages.filter(m => m.channelId === 'ch-office' && m.authorId !== 'p-md' && m.at > db.chatChannels.find(c => c.id === 'ch-office').lastRead['p-md']).length")
    check("A channel with something new shows its count", office.inner_text().strip().endswith(str(n_office)) and n_office >= 1, office.inner_text())
    office.click(); page.wait_for_timeout(400)
    check("Opening it clears the count", not side.get_by_role("link", name="Office").inner_text().strip()[-1:].isdigit())

    # ── A direct message
    side.get_by_role("link", name="Niamh Lavelle").click(); page.wait_for_timeout(400)
    check("A direct message opens with the person's name and no member count", main.get_by_role("heading", name="Niamh Lavelle").count() == 1 and main.get_by_role("button", name="members").count() == 0 and "leave request" in main.inner_text())

    # ── New message or email
    main.get_by_role("button", name="New message or email").click(); page.wait_for_timeout(300)
    d = page.locator("dialog[open]")
    d.get_by_placeholder("Find someone by name or job").fill("pat"); page.wait_for_timeout(150)
    check("New: find someone by name or job", d.get_by_role("list", name="People").locator("li").count() == 1 and "Pat Scully" in d.inner_text())
    d.get_by_placeholder("Find someone by name or job").fill("accounts"); page.wait_for_timeout(150)
    check("New: by job too", "Maeve Quirke" in d.inner_text())
    d.get_by_role("button", name="Message Maeve Quirke").click(); page.wait_for_timeout(400)
    new_dm = data(page, "db.chatChannels.find(c => c.kind === 'dm' && c.memberIds.includes('p-md') && c.memberIds.includes('p-acc'))")
    check("Message starts a direct message and opens it", new_dm is not None and f"/chat/{new_dm['id']}" in page.url and main.get_by_role("heading", name="Maeve Quirke").count() == 1 and "No messages yet" in main.inner_text(), page.url)
    check("and it joins the Direct messages list", side.get_by_role("link", name="Maeve Quirke").count() == 1)
    main.get_by_role("button", name="New message or email").click(); page.wait_for_timeout(300)
    page.locator("dialog[open]").get_by_role("button", name="Message Maeve Quirke").click(); page.wait_for_timeout(400)
    check("Messaging the same person again opens the same one", data(page, "db.chatChannels.filter(c => c.kind === 'dm' && c.memberIds.includes('p-md') && c.memberIds.includes('p-acc')).length") == 1)
    main.get_by_role("button", name="New message or email").click(); page.wait_for_timeout(300)
    page.locator("dialog[open]").get_by_role("button", name="Email Pat Scully").click(); page.wait_for_timeout(600)
    cd = page.locator("dialog[open]")
    check("Email opens a new email in Email, addressed to them", "/inbox" in page.url and cd.get_by_label("To").input_value() == data(page, "db.people.find(p => p.id === 'p-yard').email"), page.url)
    cd.get_by_role("button", name="Discard").click(); page.wait_for_timeout(200)
    go(page, "/chat/ch-C720", "main h1")

    # ── Activity log
    go(page, "/admin/activity", "main h1")
    check("Activity log: posting is recorded with where", main.locator("text=Posted in Team chat").count() >= 1 and "in C720 Ardmullen House" in main.inner_text())

    # ── Teams or Slack
    go(page, "/admin/connections", "main h1")
    page.get_by_role("tablist", name="Team chat app").get_by_role("tab", name="Slack").click(); page.wait_for_timeout(300)
    go(page, "/chat/ch-C720", "main h1")
    check("In Slack, channels go by their Slack names", side.get_by_role("link", name="c720-ardmullen-house").count() == 1 and main.get_by_role("heading", name="c720-ardmullen-house").count() == 1 and "Slack" in main.inner_text())
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)
    go(page, "/chat", "main h1")
    check("The chat app is a preference: it survives a reset", side.get_by_role("link", name="plant-and-yard").count() == 1)
    go(page, "/admin/connections", "main h1")
    page.get_by_role("tablist", name="Team chat app").get_by_role("tab", name="Microsoft Teams").click(); page.wait_for_timeout(300)

    # ── Who sees what
    as_role(page, "Site manager")
    check("A site manager has Team chat", bar_label(page, "Team chat").count() == 1)
    go(page, "/chat", "main h1")
    names = [t.strip().split("\n")[0] for t in side.get_by_role("link").all_inner_texts()]
    check("A site manager sees their own sites' channels and Plant and yard, not the others", "C719 St Finian's Church" in names and "C724 Derrybawn Bridge" in names and "Plant and yard" in names and "C720 Ardmullen House" not in names and "Accounts" not in names, names)
    go(page, "/chat/ch-accounts", "main")
    check("Another channel's address says it is not there", "This conversation is not here" in main.inner_text())
    as_role(page, "Contracts manager")
    go(page, "/chat", "main h1")
    check("Tadhg sees his direct message with the site manager", side.get_by_role("link", name="Cathal Minogue").count() == 1)
    as_role(page, "Managing director")

    # ── Phone and dark
    page.set_viewport_size({"width": 390, "height": 844})
    go(page, "/chat", "main")
    check("Phone: /chat is the list of channels", side.is_visible() and main.get_by_role("log").count() == 0)
    side.get_by_role("link", name="Office").click(); page.wait_for_timeout(400)
    check("Phone: a channel fills the screen with a way back", main.get_by_role("log").is_visible() and not side.is_visible() and main.get_by_role("link", name="Back to channels").is_visible())
    sw = page.evaluate("document.documentElement.scrollWidth")
    check("Phone: no sideways scroll", sw <= 390, sw)
    page.screenshot(path=f"{OUT}/203-chat-phone.png")
    page.set_viewport_size({"width": 1440, "height": 900})
    page.get_by_role("button", name="Switch to dark mode").click(); page.wait_for_timeout(200)
    go(page, "/chat/ch-C720", "main h1"); page.screenshot(path=f"{OUT}/204-chat-dark.png")
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
