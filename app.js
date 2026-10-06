"use strict";

const STORAGE_KEYS = {
  assignments: "assignments",
  attendance: "attendance",
  exams: "exams",
  studyPlans: "studyPlans",
  importantLinks: "importantLinks",
  motivation: "motivation"
};
const backendAvailable = window.location.protocol === "http:" || window.location.protocol === "https:";
let backendReady = false;
let backendEnabled = false;

const today = new Date();
today.setHours(0, 0, 0, 0);
const localDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const shiftDate = (days) => {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  return localDate(date);
};
const dateFromString = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const formatDate = (value, options = { month: "short", day: "numeric" }) => {
  if (!value) return "";
  return dateFromString(value).toLocaleDateString(undefined, options);
};
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const starterData = {
  assignments: [
    { id: "assignment-starter-1", subject: "Psychology", title: "Reflection journal: learning & memory", dueDate: shiftDate(2), priority: "Medium", completed: false },
    { id: "assignment-starter-2", subject: "Statistics", title: "Chapter 4 problem set", dueDate: shiftDate(5), priority: "High", completed: false }
  ],
  attendance: [
    { id: "attendance-starter-1", subject: "Psychology", total: 30, attended: 27 },
    { id: "attendance-starter-2", subject: "Statistics", total: 24, attended: 20 },
    { id: "attendance-starter-3", subject: "Media studies", total: 18, attended: 16 }
  ],
  exams: [
    { id: "exam-starter-1", subject: "Psychology", date: shiftDate(12), time: "10:00" }
  ],
  studyPlans: [
    { id: "plan-starter-1", subject: "Statistics", task: "Review probability notes", date: shiftDate(0), time: "16:00", duration: 45, completed: false },
    { id: "plan-starter-2", subject: "Psychology", task: "Make memory chapter flashcards", date: shiftDate(0), time: "17:00", duration: 30, completed: false },
    { id: "plan-starter-3", subject: "Media studies", task: "Read the lecture article", date: shiftDate(1), time: "11:00", duration: 40, completed: false }
  ],
  importantLinks: [
    { id: "link-google", name: "Google", url: "https://www.google.com" },
    { id: "link-youtube", name: "YouTube", url: "https://www.youtube.com" },
    { id: "link-chatgpt", name: "ChatGPT", url: "https://chatgpt.com" },
    { id: "link-vtu", name: "VTU Official", url: "https://vtu.ac.in" },
    { id: "link-coursera", name: "Coursera", url: "https://www.coursera.org" }
  ],
  motivation: { dailyGoal: 3, completed: 0, goalDate: localDate(today) }
};

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return structuredClone(fallback);
    }
    const value = JSON.parse(raw);
    return Array.isArray(fallback) && Array.isArray(value) ? value : (!Array.isArray(fallback) && value && typeof value === "object" ? value : structuredClone(fallback));
  } catch (error) {
    console.error(`Could not load ${key} from localStorage.`, error);
    return structuredClone(fallback);
  }
}

const data = {};
for (const [name, key] of Object.entries(STORAGE_KEYS)) data[name] = readStored(key, starterData[name]);
if (data.motivation.goalDate !== localDate(today)) {
  data.motivation.completed = 0;
  data.motivation.goalDate = localDate(today);
  save("motivation");
}

function save(name) {
  try {
    localStorage.setItem(STORAGE_KEYS[name], JSON.stringify(data[name]));
  } catch (error) {
    console.error(`Could not save ${name} to localStorage.`, error);
    showToast("Your browser couldn't save this change. Check available storage.", true);
  }
  if (backendReady && backendEnabled) {
    syncDataset(name).catch((error) => {
      console.error(`Could not sync ${name} with the backend.`, error);
      showToast("Could not sync with the server. Your change is still saved in this browser.", true);
    });
  }
}

async function syncDataset(name) {
  const response = await fetch(`/api/data/${encodeURIComponent(STORAGE_KEYS[name])}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: data[name] })
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Server responded with ${response.status}.`);
  }
}

async function connectBackend() {
  if (!backendAvailable) return false;
  try {
    const response = await fetch("/api/data");
    if (!response.ok) throw new Error(`Server responded with ${response.status}.`);
    const result = await response.json();
    if (!result.data || typeof result.data !== "object") throw new Error("The server returned an invalid data response.");
    const missingCollections = [];
    for (const [name, key] of Object.entries(STORAGE_KEYS)) {
      if (Object.prototype.hasOwnProperty.call(result.data, key)) {
        data[name] = result.data[key];
      } else {
        missingCollections.push(name);
      }
      try {
        localStorage.setItem(key, JSON.stringify(data[name]));
      } catch (error) {
        console.error(`Could not update the local ${key} backup.`, error);
      }
    }
    backendEnabled = true;
    for (const name of missingCollections) await syncDataset(name);
    backendReady = true;
    showToast("Connected — your study data is saving to SQLite.");
    return true;
  } catch (error) {
    backendEnabled = false;
    backendReady = true;
    console.error("Could not connect to the Student Life Hub backend.", error);
    showToast("Backend unavailable. Your data is being saved in this browser.", true);
    return false;
  }
}

const viewContainer = document.getElementById("viewContainer");
const sidebar = document.getElementById("sidebar");
const mobileOverlay = document.getElementById("mobileOverlay");
let currentView = document.body.dataset.page || "home";
let assignmentFilter = "All";
let plannerMode = "week";
let plannerOffset = 0;
let selectedPlannerDate = shiftDate(0);
let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let currentQuoteIndex = 0;
let toastTimer;

const quotes = [
  "Success doesn't come from what you do occasionally, it comes from what you do consistently.",
  "You don't have to see the whole staircase. Just take the first step.",
  "Small steps every day add up to big changes.",
  "You are allowed to be both a masterpiece and a work in progress.",
  "Your future self is already proud of you for starting."
];
const inspirationThoughts = [
  ["“You don’t have to do it all today. Just begin.”", "“Your pace is still progress.”", "“Rest is part of the plan, too.”"],
  ["“One page, one step, one moment at a time.”", "“You belong in every room you worked to enter.”", "“You can pause without giving up.”"],
  ["“Start where you are. Use what you have.”", "“Look how far your small steps have brought you.”", "“A slow day can still be a good day.”"]
];
let inspirationSetIndex = 0;

function showToast(message, isError = false) {
  const region = document.getElementById("toastRegion");
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 2900);
}

function navigate(view) {
  const validViews = ["home", "assignments", "attendance", "exams", "planner", "links", "motivation"];
  if (!validViews.includes(view)) return;
  window.location.href = view === "home" ? "index.html" : `${view}.html`;
}

function setPageHeader() {
  const labels = {
    home: ["Hello, student! 👋", "Keep going... You're doing great!"],
    assignments: ["Your assignments ✍️", "One little task at a time."],
    attendance: ["Your attendance 🌿", "Showing up counts. Look at you go!"],
    exams: ["Exam countdown 📚", "A little prep today goes a long way."],
    planner: ["Your study rhythm ✨", "Make a plan that feels good to follow."],
    links: ["Your useful links 🔗", "All your handy study corners, in one place."],
    motivation: ["A little motivation 💗", "You've got more in you than you know."]
  };
  const [title, subtitle] = labels[currentView] || labels.home;
  document.getElementById("pageGreeting").textContent = title;
  document.getElementById("greetingSubtitle").textContent = subtitle;
  document.querySelectorAll(".nav-link[data-nav]").forEach((element) => {
    element.classList.toggle("active", element.dataset.nav === currentView);
  });
}

function emptyState(emoji, title, message) {
  return `<div class="empty-state"><div class="empty-emoji" aria-hidden="true">${emoji}</div><h3>${title}</h3><p>${message}</p></div>`;
}

function pageHeading(eyebrow, title, description, action = "") {
  return `<div class="page-title-row"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p class="page-description">${description}</p></div>${action}</div>`;
}

function renderView() {
  const views = {
    home: renderHome,
    assignments: renderAssignments,
    attendance: renderAttendance,
    exams: renderExams,
    planner: renderPlanner,
    links: renderLinks,
    motivation: renderMotivation
  };
  viewContainer.innerHTML = views[currentView]();
  if (currentView === "planner") renderPlannerTabs();
  if (currentView === "motivation") updateGoalDisplay();
  updateNavCount();
}

function renderHome() {
  const pending = data.assignments.filter((item) => !item.completed).length;
  const nextExams = data.exams.filter((exam) => exam.date >= localDate(today)).length;
  const average = data.attendance.length
    ? Math.round(data.attendance.reduce((sum, item) => sum + item.attended / item.total * 100, 0) / data.attendance.length)
    : 0;
  const plannedSubjects = new Set(data.studyPlans.filter((task) => !task.completed).map((task) => task.subject.toLowerCase())).size;
  const tools = [
    ["assignments", "▤", "Assignment tracker", "Add, track and never miss your assignments.", "purple"],
    ["attendance", "◔", "Attendance tracker", "Keep track of your attendance and calculate percentage.", "pink"],
    ["exams", "◷", "Exam countdown", "Stay prepared with countdown reminders.", "blue"],
    ["planner", "▦", "Study planner", "Plan your study schedule and stay consistent.", "green"],
    ["links", "↗", "Important links", "Save useful links for your college and studies.", "orange"],
    ["motivation", "✧", "Motivation", "Get daily motivation to keep going.", "yellow"]
  ];
  const dueSoon = data.assignments.filter((item) => !item.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);
  const upcoming = data.exams.filter((exam) => exam.date >= localDate(today)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const planToday = data.studyPlans.filter((task) => task.date === localDate(today)).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 3);
  return `
    <section class="hero-card">
      <div class="hero-copy">
        <p class="hero-kicker">A LITTLE SPACE TO GROW</p>
        <h2>Better Plans,<br>Brighter Future <span>💗</span></h2>
        <p class="hero-subtitle">Study today, achieve tomorrow!</p>
        <a class="hero-cta" href="planner.html" data-nav="planner">Make today count <span aria-hidden="true">→</span></a>
        <p class="hero-note">You can do it <span aria-hidden="true">💗</span></p>
      </div>
      <div class="hero-photo" role="img" aria-label="Friends studying together around a table">
        <span class="hero-sticker">your pace, your path ✿</span>
      </div>
    </section>

    <section class="inspiration-section">
      <div class="section-head-row"><div><p class="eyebrow">A LITTLE LIGHT FOR YOUR DAY</p><h2>Thoughts to keep close</h2></div><button class="subtle-link inspiration-refresh" id="inspirationRefresh" type="button">A fresh thought ↻</button></div>
      <div class="inspiration-grid">
        <article class="inspiration-tile inspiration-focus">
          <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=85" alt="Student studying by a sunny window" loading="lazy">
          <div class="inspiration-shade"></div><div class="inspiration-copy"><span class="inspiration-label">WHEN YOU NEED A START</span><p>“You don’t have to do it all today. Just begin.”</p><span class="inspiration-mark">✳</span></div>
        </article>
        <article class="inspiration-tile inspiration-growth">
          <img src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=85" alt="College friends sharing a moment on campus" loading="lazy">
          <div class="inspiration-shade"></div><div class="inspiration-copy"><span class="inspiration-label">WHEN YOU NEED A REMINDER</span><p>“Your pace is still progress.”</p><span class="inspiration-mark">♡</span></div>
        </article>
        <article class="inspiration-tile inspiration-rest">
          <img src="https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=900&q=85" alt="A leafy plant in warm sunlight" loading="lazy">
          <div class="inspiration-shade"></div><div class="inspiration-copy"><span class="inspiration-label">WHEN YOU NEED A BREATH</span><p>“Rest is part of the plan, too.”</p><span class="inspiration-mark">☼</span></div>
        </article>
      </div>
      <p class="inspiration-footnote">Take what you need. Leave the rest for another day <span aria-hidden="true">♡</span></p>
    </section>

    <section class="section-block">
      <div class="section-head-row"><div><p class="eyebrow">A FEW SHORTCUTS</p><h2>What do you need today?</h2></div></div>
      <div class="tool-grid">${tools.map(([view, icon, title, description, tone]) => `
        <a class="tool-card tone-${tone}" href="${view === "home" ? "index.html" : `${view}.html`}" data-nav="${view}">
          <span class="tool-card-top"><span class="tool-icon" aria-hidden="true">${icon}</span><span class="tool-arrow" aria-hidden="true">↗</span></span>
          <h3>${title}</h3><p>${description}</p>
        </a>`).join("")}</div>
    </section>

    <section class="section-block">
      <div class="section-head-row"><div><p class="eyebrow">A QUICK LITTLE CHECK-IN</p><h2>Today's overview</h2></div></div>
      <div class="overview-grid">
        <a class="overview-card" href="assignments.html" data-nav="assignments"><span class="overview-label">Assignments</span><div class="overview-value">${pending}</div><div class="overview-hint">still on your list</div></a>
        <a class="overview-card" href="exams.html" data-nav="exams"><span class="overview-label">Upcoming exams</span><div class="overview-value">${nextExams}</div><div class="overview-hint">you've got this</div></a>
        <a class="overview-card" href="attendance.html" data-nav="attendance"><span class="overview-label">Attendance</span><div class="overview-value">${average}%</div><div class="overview-hint">across your subjects</div></a>
        <a class="overview-card" href="planner.html" data-nav="planner"><span class="overview-label">Study plan</span><div class="overview-value">${plannedSubjects}</div><div class="overview-hint">subjects in the mix</div></a>
      </div>
    </section>

    <div class="dashboard-lower">
      <section class="panel mini-panel">
        <div class="section-heading"><div><p class="eyebrow">COMING UP</p><h2>Assignments to keep in mind</h2></div><a class="subtle-link" href="assignments.html" data-nav="assignments">See all →</a></div>
        <div class="mini-list">${dueSoon.length ? dueSoon.map((item) => `<div class="mini-row"><i class="mini-dot"></i><div class="mini-row-copy"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.subject)} · due ${formatDate(item.dueDate)}</span></div><span class="mini-tag">${escapeHTML(item.priority)}</span></div>`).join("") : '<p class="empty-hint">Nothing due right now. Enjoy the breathing room.</p>'}</div>
      </section>
      <section class="panel mini-panel">
        <div class="section-heading"><div><p class="eyebrow">ON YOUR RADAR</p><h2>Your next little wins</h2></div><a class="subtle-link" href="planner.html" data-nav="planner">Study plan →</a></div>
        <div class="mini-list">${planToday.length ? planToday.map((task) => `<div class="mini-row"><i class="mini-dot"></i><div class="mini-row-copy"><strong>${escapeHTML(task.task)}</strong><span>${escapeHTML(task.subject)} · ${task.time} · ${task.duration} min</span></div><span class="mini-tag safe">today</span></div>`).join("") : upcoming.length ? upcoming.map((exam) => `<div class="mini-row"><i class="mini-dot"></i><div class="mini-row-copy"><strong>${escapeHTML(exam.subject)} exam</strong><span>${formatDate(exam.date)} · ${exam.time || "Time TBD"}</span></div><span class="mini-tag">${daysUntil(exam.date)}</span></div>`).join("") : '<p class="empty-hint">A clear day is a lovely thing. Add a plan when you’re ready.</p>'}</div>
      </section>
    </div>
    <section class="ad-inline" aria-label="Sponsored space"><div><p class="eyebrow">SPONSORED SPACE</p><strong>Good things for your student days.</strong><p>A spot for thoughtful student offers and campus-friendly brands.</p></div><span class="ad-inline-art" aria-hidden="true">✧</span></section>
    ${renderAiHelper()}
  `;
}

function daysUntil(dateString) {
  const difference = Math.round((dateFromString(dateString) - today) / 86400000);
  if (difference < 0) return "Completed";
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  return `${difference} days left`;
}

function renderAssignments() {
  const filtered = data.assignments.filter((item) => assignmentFilter === "All" || (assignmentFilter === "Pending" ? !item.completed : item.completed))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return `${pageHeading("YOUR TO-DO LIST", "Assignments", "A clear view of what’s due, so nothing sneaks up on you.")}
    <section class="panel form-card"><h3>Add a new assignment</h3>
      <form class="entry-form" id="assignmentForm">
        <div class="field"><label for="assignmentSubject">Subject</label><input id="assignmentSubject" name="subject" maxlength="45" placeholder="e.g. Psychology" required></div>
        <div class="field"><label for="assignmentTitle">Assignment title</label><input id="assignmentTitle" name="title" maxlength="90" placeholder="What do you need to do?" required></div>
        <div class="field"><label for="assignmentDue">Due date</label><input id="assignmentDue" name="dueDate" type="date" min="${localDate(today)}" required></div>
        <div class="field"><label for="assignmentPriority">Priority</label><select id="assignmentPriority" name="priority"><option>Low</option><option selected>Medium</option><option>High</option></select></div>
        <button class="primary-button" type="submit">+ Add assignment</button>
      </form>
    </section>
    <section class="panel list-panel"><div class="list-toolbar"><h3>Your assignment list <span class="muted-count">(${data.assignments.length})</span></h3>
      <div class="filter-group" role="group" aria-label="Filter assignments">${["All", "Pending", "Completed"].map((filter) => `<button class="filter-button${assignmentFilter === filter ? " active" : ""}" type="button" data-filter="${filter}">${filter}</button>`).join("")}</div></div>
      <div class="data-list">${filtered.length ? filtered.map(renderAssignmentRow).join("") : emptyState("✍️", "Nothing here just yet", assignmentFilter === "Completed" ? "Finished tasks will show up here. Look at you go!" : "Add an assignment above to get your week started.")}</div>
    </section>`;
}

function renderAssignmentRow(item) {
  const isOverdue = !item.completed && item.dueDate < localDate(today);
  return `<article class="data-row${item.completed ? " completed" : ""}">
    <input class="row-check" type="checkbox" data-toggle-assignment="${item.id}" aria-label="Mark ${escapeHTML(item.title)} as ${item.completed ? "pending" : "completed"}"${item.completed ? " checked" : ""}>
    <div class="row-main"><span class="row-title">${escapeHTML(item.title)}</span><span class="row-meta"><span>${escapeHTML(item.subject)}</span><span class="${isOverdue ? "overdue" : ""}">${isOverdue ? "Overdue · " : "Due "}${formatDate(item.dueDate, { weekday: "short", month: "short", day: "numeric" })}</span></span></div>
    <div class="row-actions"><span class="priority priority-${item.priority.toLowerCase()}">${escapeHTML(item.priority)}</span><button class="icon-action" type="button" data-delete-assignment="${item.id}" aria-label="Delete ${escapeHTML(item.title)}">×</button></div>
  </article>`;
}

function renderAttendance() {
  return `${pageHeading("SHOWING UP FOR YOU", "Attendance tracker", "Keep an eye on your classes and stay on the safe side.")}
    <section class="panel form-card"><h3>Add a subject</h3>
      <form class="entry-form" id="attendanceForm">
        <div class="field"><label for="attendanceSubject">Subject</label><input id="attendanceSubject" name="subject" maxlength="45" placeholder="e.g. Biology" required></div>
        <div class="field"><label for="totalClasses">Total classes so far</label><input id="totalClasses" name="total" type="number" min="1" max="10000" placeholder="24" required></div>
        <div class="field"><label for="attendedClasses">Classes attended</label><input id="attendedClasses" name="attended" type="number" min="0" max="10000" placeholder="21" required></div>
        <button class="primary-button" type="submit">+ Add subject</button>
      </form><p class="form-hint">Your percentage updates as you update the classes. Green ≥ 75%, orange ≥ 65%, red below 65%.</p>
    </section>
    <section class="panel list-panel"><div class="list-toolbar"><h3>Your subjects (${data.attendance.length})</h3></div>
      <div class="data-list">${data.attendance.length ? data.attendance.map((subject) => {
        const percentage = Math.round(subject.attended / subject.total * 100);
        const status = percentage >= 75 ? "attendance-safe" : percentage >= 65 ? "attendance-warn" : "attendance-danger";
        const needed = Math.max(0, Math.ceil(3 * subject.total - 4 * subject.attended));
        const neededText = needed === 0 ? "You’re at 75% or above — keep it up!" : `Attend the next ${needed} class${needed === 1 ? "" : "es"} to reach 75%.`;
        return `<article class="data-row attendance-row"><div class="row-main"><span class="row-title">${escapeHTML(subject.subject)}</span><span class="row-meta">${subject.attended} attended · ${subject.total} total · <span class="${status}">${neededText}</span></span></div>
          <div class="attendance-row-footer"><strong class="attendance-number ${status}">${percentage}%</strong><div class="attendance-track" role="progressbar" aria-label="${escapeHTML(subject.subject)} attendance" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100"><span class="${status}" style="width:${Math.min(100, percentage)}%"></span></div><div class="attendance-update-actions"><button class="attendance-update" type="button" data-attendance-class="${subject.id}" data-attended="true">✓ Attended</button><button class="attendance-update" type="button" data-attendance-class="${subject.id}" data-attended="false">+ Missed</button></div><button class="icon-action" type="button" data-delete-attendance="${subject.id}" aria-label="Delete ${escapeHTML(subject.subject)}">×</button></div></article>`;
      }).join("") : emptyState("◔", "Your class list starts here", "Add a subject above to see your attendance at a glance.")}</div>
    </section>`;
}

function renderExams() {
  const exams = [...data.exams].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return `${pageHeading("A LITTLE HEAD START", "Exam countdown", "See what’s coming up and give yourself room to prepare.")}
    <section class="panel form-card"><h3>Add an exam</h3>
      <form class="entry-form" id="examForm">
        <div class="field"><label for="examSubject">Subject</label><input id="examSubject" name="subject" maxlength="45" placeholder="e.g. Chemistry" required></div>
        <div class="field"><label for="examDate">Exam date</label><input id="examDate" name="date" type="date" min="${localDate(today)}" required></div>
        <div class="field"><label for="examTime">Exam time</label><input id="examTime" name="time" type="time" required></div>
        <button class="primary-button" type="submit">+ Add exam</button>
      </form>
    </section>
    <section class="panel list-panel"><div class="list-toolbar"><h3>On the horizon (${exams.length})</h3></div>
      <div class="data-list">${exams.length ? exams.map((exam) => {
        const diff = Math.round((dateFromString(exam.date) - today) / 86400000);
        return `<article class="data-row"><div class="row-main"><span class="row-title">${escapeHTML(exam.subject)}</span><span class="row-meta">${formatDate(exam.date, { weekday: "long", month: "long", day: "numeric" })} · ${exam.time || "Time not set"}</span></div><div class="row-actions"><span class="status-pill ${diff < 0 ? "attendance-safe" : "attendance-warn"}">${daysUntil(exam.date)}</span><button class="icon-action" type="button" data-delete-exam="${exam.id}" aria-label="Delete ${escapeHTML(exam.subject)} exam">×</button></div></article>`;
      }).join("") : emptyState("◷", "No exams on your radar", "Add an exam date and we’ll keep the countdown handy.")}</div>
    </section>`;
}

function weekStart(offset = 0) {
  const date = new Date(today);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset + offset * 7);
  return date;
}
function renderPlanner() {
  const start = weekStart(plannerOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const label = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const tasks = data.studyPlans.filter((task) => plannerMode === "day" ? task.date === selectedPlannerDate : task.date >= localDate(start) && task.date <= localDate(end))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return `${pageHeading("MAKE SPACE TO FOCUS", "Study planner", "A kind little plan is better than a perfect plan you never start.", `<div class="week-controls"><button class="icon-button" type="button" data-week="-1" aria-label="Previous week">‹</button><span class="week-label">${label}</span><button class="icon-button" type="button" data-week="1" aria-label="Next week">›</button></div>`)}
    <section class="panel form-card"><h3>Add a study session</h3>
      <form class="entry-form" id="plannerForm">
        <div class="field"><label for="planSubject">Subject</label><input id="planSubject" name="subject" maxlength="45" placeholder="e.g. Biology" required></div>
        <div class="field"><label for="planTask">Study task</label><input id="planTask" name="task" maxlength="90" placeholder="What will you work on?" required></div>
        <div class="field"><label for="planDate">Date</label><input id="planDate" name="date" type="date" value="${selectedPlannerDate}" required></div>
        <div class="field"><label for="planTime">Start time</label><input id="planTime" name="time" type="time" value="16:00" required></div>
        <div class="field"><label for="planDuration">Duration (minutes)</label><select id="planDuration" name="duration"><option value="25">25 min · focus sprint</option><option value="30">30 minutes</option><option value="45" selected>45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></div>
        <button class="primary-button" type="submit">+ Add session</button>
      </form>
    </section>
    <section class="panel list-panel"><div class="list-toolbar"><h3>Your study rhythm</h3><div class="filter-group"><button class="filter-button${plannerMode === "day" ? " active" : ""}" type="button" data-planner-mode="day">Day</button><button class="filter-button${plannerMode === "week" ? " active" : ""}" type="button" data-planner-mode="week">Week</button></div></div>
      <div class="day-tabs" id="dayTabs"></div><div class="data-list" id="plannerTasks">${tasks.length ? tasks.map(renderPlanRow).join("") : emptyState("▦", "Room for a fresh start", "Add a study session above whenever you’re ready.")}</div>
    </section>`;
}
function renderPlannerTabs() {
  const start = weekStart(plannerOffset);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  document.getElementById("dayTabs").innerHTML = days.map((name, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const string = localDate(date);
    return `<button class="day-tab${selectedPlannerDate === string ? " active" : ""}" type="button" data-select-day="${string}">${name}<strong>${date.getDate()}</strong></button>`;
  }).join("");
  document.getElementById("dayTabs").style.display = plannerMode === "week" ? "flex" : "none";
}
function renderPlanRow(task) {
  const dateLabel = formatDate(task.date, { weekday: "short", month: "short", day: "numeric" });
  return `<article class="data-row${task.completed ? " completed" : ""}"><input class="row-check" type="checkbox" data-toggle-plan="${task.id}" aria-label="Mark ${escapeHTML(task.task)} as ${task.completed ? "not completed" : "completed"}"${task.completed ? " checked" : ""}>
    <span class="task-time">${task.time}</span><div class="row-main"><span class="row-title">${escapeHTML(task.task)}</span><span class="row-meta">${escapeHTML(task.subject)} · ${dateLabel}</span></div><span class="task-duration">${task.duration} min</span><button class="icon-action" type="button" data-delete-plan="${task.id}" aria-label="Delete ${escapeHTML(task.task)}">×</button></article>`;
}

function safeUrl(value) {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function renderLinks() {
  return `${pageHeading("YOUR LITTLE DIGITAL TOOLKIT", "Important links", "Keep your go-to college and study websites close by.")}
    <section class="panel form-card"><h3>Save a useful link</h3>
      <form class="entry-form" id="linkForm">
        <div class="field"><label for="linkName">Website name</label><input id="linkName" name="name" maxlength="45" placeholder="e.g. My college portal" required></div>
        <div class="field"><label for="linkUrl">Website URL</label><input id="linkUrl" name="url" type="url" maxlength="250" placeholder="https://example.com" required></div>
        <button class="primary-button" type="submit">+ Save link</button>
      </form><p class="form-hint">Links open in a new tab. Only http and https addresses are accepted.</p>
    </section>
    <section class="panel list-panel"><div class="list-toolbar"><h3>Your saved links (${data.importantLinks.length})</h3></div>
      <div class="data-list">${data.importantLinks.length ? data.importantLinks.map((link) => {
        const url = safeUrl(link.url);
        return `<article class="data-row"><span class="site-icon" aria-hidden="true">${escapeHTML(link.name.trim().charAt(0).toUpperCase())}</span><div class="row-main"><span class="row-title">${escapeHTML(link.name)}</span><a class="link-url" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(new URL(url).hostname)}</a></div><div class="link-actions"><a class="icon-action external-action" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(link.name)} in a new tab">↗</a><button class="icon-action" type="button" data-delete-link="${link.id}" aria-label="Delete ${escapeHTML(link.name)}">×</button></div></article>`;
      }).join("") : emptyState("↗", "Your links live here", "Save the websites you use most and find them in a click.")}</div>
    </section>`;
}

function renderMotivation() {
  const quote = quotes[currentQuoteIndex % quotes.length];
  return `${pageHeading("A SOFTER KIND OF PRODUCTIVITY", "A little motivation", "A gentle nudge for the days that need one.")}
    <section class="motivation-hero"><p class="eyebrow">A THOUGHT FOR YOU</p><blockquote id="motivationQuote">${escapeHTML(quote)}</blockquote><p class="quote-byline">A small reminder, just for today.</p><span class="motivation-hero-decoration" aria-hidden="true"></span></section>
      <button class="primary-button" id="newQuoteButton" type="button" style="margin-top:12px">✧ &nbsp; A new quote</button>
    <section class="panel goal-card"><div class="goal-progress-row"><div><h3>Your daily goal</h3><p>Small wins make a lovely kind of momentum.</p></div><div class="goal-progress-ring" id="goalProgressRing"><span id="goalPercent">0%</span></div></div>
      <div class="goal-controls"><label for="dailyGoalInput" class="field-label">Sessions today</label><button class="goal-stepper" type="button" data-goal-step="-1" aria-label="Remove one completed session">−</button><span class="goal-count" id="goalCount"></span><button class="goal-stepper" type="button" data-goal-step="1" aria-label="Add one completed session">+</button><span class="field-label">Daily goal</span><input class="goal-input" id="dailyGoalInput" type="number" min="1" max="20" value="${data.motivation.dailyGoal}" aria-label="Daily session goal"><button class="primary-button goal-save" id="saveGoalButton" type="button">Save goal</button></div>
    </section>
    ${renderAiHelper()}`;
}

function renderAiHelper() {
  return `<section class="panel ai-card"><div class="ai-card-header"><span class="ai-badge" aria-hidden="true">✧</span><div><h3>AI study helper</h3><p>Turn a tricky topic into a clearer next step.</p></div></div>
    <form class="ai-form" id="aiForm"><input class="ai-input" id="aiQuestion" name="aiQuestion" maxlength="500" placeholder="What are you working through?" aria-label="Your study question" required><select class="ai-input" id="aiSubject" name="aiSubject" aria-label="Choose a subject"><option value="General">General</option>${[...new Set([...data.attendance.map((item) => item.subject), ...data.studyPlans.map((item) => item.subject)])].map((subject) => `<option>${escapeHTML(subject)}</option>`).join("")}</select><button class="primary-button" type="submit" id="aiAskButton">Ask</button></form>
    <div class="ai-answer" id="aiAnswer" role="status"></div><p class="ai-disclaimer">Preview mode: answers are a study framework, not AI-generated. Connect a secure backend to add an AI provider; never put an API key in this page.</p>
  </section>`;
}

function updateGoalDisplay() {
  const goal = Math.max(1, Number(data.motivation.dailyGoal) || 1);
  const completed = Math.max(0, Number(data.motivation.completed) || 0);
  const percent = Math.min(100, Math.round(completed / goal * 100));
  document.getElementById("goalCount").textContent = `${completed} / ${goal}`;
  document.getElementById("goalPercent").textContent = `${percent}%`;
  document.getElementById("goalProgressRing").style.setProperty("--progress", `${percent}%`);
}

function renderCalendar() {
  if (!document.getElementById("calendarMonth")) return;
  const monthLabel = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  document.getElementById("calendarMonth").textContent = monthLabel;
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const eventDates = new Set([...data.exams.map((exam) => exam.date), ...data.studyPlans.map((plan) => plan.date)]);
  const cells = ["M", "T", "W", "T", "F", "S", "S"].map((day) => `<span class="calendar-cell weekday" role="columnheader">${day}</span>`);
  for (let cell = 0; cell < 42; cell += 1) {
    let dateNumber;
    let dateString;
    let muted = false;
    if (cell < startOffset) {
      dateNumber = prevDays - startOffset + cell + 1;
      dateString = localDate(new Date(year, month - 1, dateNumber));
      muted = true;
    } else if (cell >= startOffset + daysInMonth) {
      dateNumber = cell - startOffset - daysInMonth + 1;
      dateString = localDate(new Date(year, month + 1, dateNumber));
      muted = true;
    } else {
      dateNumber = cell - startOffset + 1;
      dateString = localDate(new Date(year, month, dateNumber));
    }
    const classes = ["calendar-cell", muted ? "muted-day" : "", dateString === localDate(today) ? "is-today" : "", eventDates.has(dateString) ? "has-event" : ""].filter(Boolean).join(" ");
    cells.push(`<span class="${classes}" role="gridcell" aria-label="${formatDate(dateString, { month: "long", day: "numeric" })}">${dateNumber}</span>`);
  }
  document.getElementById("calendarGrid").innerHTML = cells.join("");
}

function renderQuickLinks() {
  if (!document.getElementById("quickLinkList")) return;
  const shortcuts = data.importantLinks.slice(0, 5);
  document.getElementById("quickLinkList").innerHTML = shortcuts.length ? shortcuts.map((link) => {
    const url = safeUrl(link.url);
    return `<a class="quick-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer"><span class="link-badge">${escapeHTML(link.name.trim().charAt(0).toUpperCase())}</span><span>${escapeHTML(link.name)}</span></a>`;
  }).join("") : '<p class="empty-hint">Save a link to keep your favorite study sites close.</p>';
}

function updateNavCount() {
  const count = document.getElementById("navAssignmentCount");
  if (count) count.textContent = data.assignments.filter((item) => !item.completed).length;
}

function persistAndRefresh(name, message, rerender = true) {
  save(name);
  if (rerender) renderView();
  renderCalendar();
  renderQuickLinks();
  updateNavCount();
  updateHeaderDate();
  if (message) showToast(message);
}

function updateHeaderDate() {
  const options = { weekday: "short", month: "short", day: "numeric" };
  document.getElementById("topbarDate").textContent = today.toLocaleDateString(undefined, options);
  const label = document.getElementById("todayLabel");
  if (label) label.textContent = today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
}

function nextQuote() {
  if (quotes.length > 1) {
    let next = currentQuoteIndex;
    while (next === currentQuoteIndex) next = Math.floor(Math.random() * quotes.length);
    currentQuoteIndex = next;
  }
  const quote = quotes[currentQuoteIndex];
  const sideQuote = document.getElementById("sideQuote");
  if (sideQuote) sideQuote.textContent = quote;
  const mainQuote = document.getElementById("motivationQuote");
  if (mainQuote) mainQuote.textContent = quote;
}

function requireConfirm(message) {
  return window.confirm(message);
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    event.preventDefault();
    navigate(nav.dataset.nav);
    return;
  }
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    assignmentFilter = filter.dataset.filter;
    renderView();
    return;
  }
  const assignmentToggle = event.target.closest("[data-toggle-assignment]");
  if (assignmentToggle) {
    const item = data.assignments.find((assignment) => assignment.id === assignmentToggle.dataset.toggleAssignment);
    if (!item) return;
    item.completed = assignmentToggle.checked;
    persistAndRefresh("assignments", item.completed ? "A little win — assignment complete!" : "Assignment moved back to your list.");
    return;
  }
  const planToggle = event.target.closest("[data-toggle-plan]");
  if (planToggle) {
    const task = data.studyPlans.find((plan) => plan.id === planToggle.dataset.togglePlan);
    if (!task) return;
    task.completed = planToggle.checked;
    if (localDate(today) === task.date) data.motivation.completed = Math.max(0, data.motivation.completed + (task.completed ? 1 : -1));
    save("studyPlans");
    save("motivation");
    persistAndRefresh("studyPlans", task.completed ? "Study session complete — you showed up!" : "Study session marked incomplete.");
    return;
  }
  const attendanceUpdate = event.target.closest("[data-attendance-class]");
  if (attendanceUpdate) {
    const subject = data.attendance.find((item) => item.id === attendanceUpdate.dataset.attendanceClass);
    if (!subject) return;
    subject.total += 1;
    if (attendanceUpdate.dataset.attended === "true") subject.attended += 1;
    persistAndRefresh("attendance", attendanceUpdate.dataset.attended === "true" ? "Class marked attended." : "Missed class recorded.");
    return;
  }
  const deleteSpecs = [
    ["data-delete-assignment", "assignments", "assignment", "Delete this assignment?"],
    ["data-delete-attendance", "attendance", "subject", "Remove this subject and its attendance record?"],
    ["data-delete-exam", "exams", "exam", "Delete this exam?"],
    ["data-delete-plan", "studyPlans", "study session", "Delete this study session?"],
    ["data-delete-link", "importantLinks", "link", "Delete this saved link?"]
  ];
  for (const [attribute, key, label, question] of deleteSpecs) {
    const button = event.target.closest(`[${attribute}]`);
    if (button) {
      if (!requireConfirm(question)) return;
      data[key] = data[key].filter((item) => item.id !== button.getAttribute(attribute));
      persistAndRefresh(key, `Your ${label} was deleted.`);
      return;
    }
  }
  const mode = event.target.closest("[data-planner-mode]");
  if (mode) {
    plannerMode = mode.dataset.plannerMode;
    renderView();
    return;
  }
  const day = event.target.closest("[data-select-day]");
  if (day) {
    selectedPlannerDate = day.dataset.selectDay;
    plannerMode = "day";
    renderView();
    return;
  }
  const week = event.target.closest("[data-week]");
  if (week) {
    plannerOffset += Number(week.dataset.week);
    selectedPlannerDate = localDate(weekStart(plannerOffset));
    renderView();
    return;
  }
  const goalStep = event.target.closest("[data-goal-step]");
  if (goalStep) {
    data.motivation.completed = Math.max(0, data.motivation.completed + Number(goalStep.dataset.goalStep));
    save("motivation");
    updateGoalDisplay();
    return;
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());
  if (form.id === "assignmentForm") {
    data.assignments.push({ id: makeId(), subject: values.subject.trim(), title: values.title.trim(), dueDate: values.dueDate, priority: values.priority, completed: false });
    persistAndRefresh("assignments", "Assignment added to your list.");
  } else if (form.id === "attendanceForm") {
    const total = Number(values.total);
    const attended = Number(values.attended);
    if (!Number.isInteger(total) || !Number.isInteger(attended) || total < 1 || attended < 0 || attended > total) {
      showToast("Attended classes must be between zero and total classes.", true);
      return;
    }
    if (data.attendance.some((item) => item.subject.toLowerCase() === values.subject.trim().toLowerCase())) {
      showToast("That subject is already on your list.", true);
      return;
    }
    data.attendance.push({ id: makeId(), subject: values.subject.trim(), total, attended });
    persistAndRefresh("attendance", "Subject added. Your percentage is ready.");
  } else if (form.id === "examForm") {
    data.exams.push({ id: makeId(), subject: values.subject.trim(), date: values.date, time: values.time });
    persistAndRefresh("exams", "Exam added to your countdown.");
  } else if (form.id === "plannerForm") {
    data.studyPlans.push({ id: makeId(), subject: values.subject.trim(), task: values.task.trim(), date: values.date, time: values.time, duration: Number(values.duration), completed: false });
    selectedPlannerDate = values.date;
    persistAndRefresh("studyPlans", "Study session added to your plan.");
  } else if (form.id === "linkForm") {
    const url = safeUrl(values.url.trim());
    if (!url) {
      showToast("Please enter a valid http or https website address.", true);
      return;
    }
    data.importantLinks.push({ id: makeId(), name: values.name.trim(), url });
    persistAndRefresh("importantLinks", "Link saved to your toolkit.");
  } else if (form.id === "aiForm") {
    answerStudyQuestion(values);
  }
});

async function answerStudyQuestion(values) {
  const button = document.getElementById("aiAskButton");
  const answer = document.getElementById("aiAnswer");
  button.disabled = true;
  button.textContent = "Thinking…";
  answer.classList.add("visible");
  answer.innerHTML = "<strong>Putting together a starting point…</strong>";
  await new Promise((resolve) => window.setTimeout(resolve, 450));
  const question = escapeHTML(values.aiQuestion.trim());
  const subject = escapeHTML(values.aiSubject);
  answer.innerHTML = `<strong>A study framework for ${subject}</strong>For “${question}”, try this: write down what you already know, split the question into the smallest unclear part, then explain that part in your own words. Check your notes for one example, and finish by writing one follow-up question to explore. <em>This is a built-in demo response, not an AI answer.</em>`;
  button.disabled = false;
  button.textContent = "Ask";
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#inspirationRefresh")) {
    inspirationSetIndex = (inspirationSetIndex + 1) % inspirationThoughts.length;
    document.querySelectorAll(".inspiration-copy p").forEach((thought, index) => {
      thought.textContent = inspirationThoughts[inspirationSetIndex][index];
    });
    showToast("A few fresh thoughts for your day.");
  }
  if (event.target.closest("#newQuoteButton") || event.target.closest("#sideNewQuote")) nextQuote();
  if (event.target.closest("#saveGoalButton")) {
    const input = document.getElementById("dailyGoalInput");
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 1 || value > 20) {
      showToast("Choose a daily goal between 1 and 20 sessions.", true);
      input.focus();
      return;
    }
    data.motivation.dailyGoal = value;
    save("motivation");
    updateGoalDisplay();
    showToast("Your daily goal has been updated.");
  }
  if (event.target.closest("#calendarPrev")) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
  }
  if (event.target.closest("#calendarNext")) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
  }
  if (event.target.closest("#todayButton")) {
    selectedPlannerDate = localDate(today);
    plannerOffset = 0;
    navigate("planner");
  }
});

document.getElementById("menuToggle").addEventListener("click", () => {
  const isOpen = sidebar.classList.toggle("open");
  mobileOverlay.classList.toggle("open", isOpen);
  document.getElementById("menuToggle").setAttribute("aria-expanded", String(isOpen));
});
mobileOverlay.addEventListener("click", () => {
  sidebar.classList.remove("open");
  mobileOverlay.classList.remove("open");
  document.getElementById("menuToggle").setAttribute("aria-expanded", "false");
});

async function initialize() {
  await connectBackend();
  setPageHeader();
  updateHeaderDate();
  renderView();
  if (document.getElementById("calendarMonth")) renderCalendar();
  if (document.getElementById("quickLinkList")) renderQuickLinks();
  const sideQuote = document.getElementById("sideQuote");
  if (sideQuote) sideQuote.textContent = quotes[currentQuoteIndex];
}
initialize();
