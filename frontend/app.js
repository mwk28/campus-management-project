// app.js — updated UI with cards, menu, modals, earth tones
const STORAGE_KEY = "campus_frontend_v2";

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const init = {
      users: [],
      books: [
        {
          id: 1,
          title: "Discrete Mathematics",
          author: "Rosen",
          available: true,
          owner_name: null,
        },
      ],
      machines: [
        { id: 1, name: "Washer 1", busy: false, free_at: null, note: "" },
        { id: 2, name: "Washer 2", busy: false, free_at: null, note: "" },
      ],
      reports: [],
      activities: [],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
    return init;
  }
  return JSON.parse(raw);
}
function saveState(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

let state = loadState();
let currentUser = null;

// UI refs
const loginWrap = document.getElementById("loginWrap");
const signInBtn = document.getElementById("signInBtn");
const openLogin = document.getElementById("openLogin");
const openDashboard = document.getElementById("openDashboard");
const nameInput = document.getElementById("nameInput");
const rollInput = document.getElementById("rollInput");
const userShort = document.getElementById("userShort");
const mainArea = document.getElementById("mainArea");

const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");
const reportBtn = document.getElementById("reportBtn");
const profileBtn = document.getElementById("profileBtn");
const historyBtn = document.getElementById("historyBtn");

const reportModal = document.getElementById("reportModal");
const reportText = document.getElementById("reportText");
const sendReport = document.getElementById("sendReport");
const closeReport = document.getElementById("closeReport");

const profileModal = document.getElementById("profileModal");
const profileContent = document.getElementById("profileContent");
const closeProfile = document.getElementById("closeProfile");

const historyModal = document.getElementById("historyModal");
const historyContent = document.getElementById("historyContent");
const closeHistory = document.getElementById("closeHistory");

openLogin.onclick = () => showLogin();
openDashboard.onclick = () => showDashboard();

menuBtn.addEventListener("click", () =>
  menuDropdown.classList.toggle("hidden")
);
document.addEventListener("click", (e) => {
  if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target))
    menuDropdown.classList.add("hidden");
});

reportBtn.onclick = () => {
  menuDropdown.classList.add("hidden");
  reportModal.classList.remove("hidden");
};
profileBtn.onclick = () => {
  menuDropdown.classList.add("hidden");
  showProfile();
};
historyBtn.onclick = () => {
  menuDropdown.classList.add("hidden");
  showHistory();
};

closeReport.onclick = () => reportModal.classList.add("hidden");
sendReport.onclick = () => {
  const text = reportText.value.trim();
  if (!text) {
    alert("Write something");
    return;
  }
  state.reports.push({
    id: Date.now(),
    text,
    at: new Date().toISOString(),
    by: currentUser?.name || "anonymous",
  });
  saveState(state);
  reportText.value = "";
  reportModal.classList.add("hidden");
  addActivity(`Report added by ${currentUser?.name || "anonymous"}`);
  alert("Thanks! your report is saved locally for demo.");
};

closeProfile.onclick = () => profileModal.classList.add("hidden");
closeHistory.onclick = () => historyModal.classList.add("hidden");

function showLogin() {
  loginWrap.classList.remove("hidden");
}
signInBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name) {
    alert("Enter name");
    return;
  }
  const roll = rollInput.value.trim();
  currentUser = { id: Date.now(), name, roll };
  state.users.push(currentUser);
  saveState(state);
  userShort.textContent = `${currentUser.name} ${
    currentUser.roll ? "- " + currentUser.roll : ""
  }`;
  loginWrap.classList.add("hidden");
  addActivity(`Signed in as ${currentUser.name}`);
  showDashboard();
};

function showProfile() {
  profileModal.classList.remove("hidden");
  profileContent.innerHTML = currentUser
    ? `
    <div><strong>${currentUser.name}</strong></div>
    <div class="small muted">Roll: ${currentUser.roll || "—"}</div>
    <div class="small muted">Joined (demo): ${new Date(
      currentUser.id
    ).toLocaleString()}</div>
  `
    : "No user signed in";
}

function showHistory() {
  historyModal.classList.remove("hidden");
  if (state.activities.length === 0) {
    historyContent.innerHTML =
      '<div class="small muted">No activities yet</div>';
    return;
  }
  historyContent.innerHTML = state.activities
    .slice()
    .reverse()
    .map(
      (a) =>
        `<div style="margin-bottom:6px"><strong class="small">${
          a.text
        }</strong><div class="small muted">${new Date(
          a.at
        ).toLocaleString()}</div></div>`
    )
    .join("");
}

function addActivity(text) {
  state.activities.push({ text, at: new Date().toISOString() });
  saveState(state);
}

// Dashboard & modules
function showDashboard() {
  mainArea.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>Dashboard</h3>
    <div class="tiles" id="tiles"></div>
    <div class="footer small muted" style="margin-top:14px"></div>
  `;
  mainArea.appendChild(card);

  const tiles = document.getElementById("tiles");
  const modules = [
    {
      id: "library",
      title: "Library",
      desc: "Manage books: add, rent, return (working)",
      img: "assets/cards/library.jpg",
    },
    {
      id: "washing",
      title: "Washing Area",
      desc: "See machine usage & reserve (working)",
      img: "assets/cards/washing.jpg",
    },
    {
      id: "badminton",
      title: "Badminton Court",
      desc: "Coming soon",
      img: "assets/cards/badminton.jpg",
    },
    {
      id: "sports",
      title: "Sports Items",
      desc: "Coming soon",
      img: "assets/cards/sports.jpg",
    },
    {
      id: "food",
      title: "Food Court / Mess",
      desc: "Coming soon",
      img: "assets/cards/food.jpg",
    },
    {
      id: "shop",
      title: "Campus Shop",
      desc: "Coming soon",
      img: "assets/cards/shop.jpg",
    },
  ];

  modules.forEach((m) => {
    const el = document.createElement("div");
    el.className = "tile";
    el.innerHTML = `
      <img src="${
        m.img
      }" onerror="this.src='https://via.placeholder.com/120x80/efe1c6/7a4a2a?text=${encodeURIComponent(
      m.title
    )}'"/>
      <div class="meta">
        <h4>${m.title}</h4>
        <p>${m.desc}</p>
      </div>
    `;
    el.addEventListener("click", () => {
      if (m.id === "library") renderLibrary();
      else if (m.id === "washing") renderWashing();
      else alert("Coming soon — will be added later");
    });
    tiles.appendChild(el);
  });
}

// Library UI (local-only)
function renderLibrary() {
  mainArea.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>Library</h3>
    <div class="row" style="gap:8px;margin-top:8px;">
      <input id="q" placeholder="Search title or author" />
      <select id="filterOwner"><option value="all">All</option><option value="mine">My Books</option><option value="shared">Shared</option></select>
      <button id="addBookBtn">Add Book</button>
    </div>
    <div id="bookList" style="margin-top:12px"></div>
  `;
  mainArea.appendChild(card);

  document.getElementById("addBookBtn").onclick = addBook;
  document.getElementById("q").addEventListener("input", updateList);
  document.getElementById("filterOwner").addEventListener("change", updateList);
  updateList();

  function updateList() {
    const q = document.getElementById("q").value.toLowerCase();
    const f = document.getElementById("filterOwner").value;
    const list = document.getElementById("bookList");
    list.innerHTML = "";
    state.books
      .filter((b) =>
        (b.title + " " + (b.author || "")).toLowerCase().includes(q)
      )
      .filter(
        (b) =>
          f === "all" ||
          (f === "mine" && b.owner_name === (currentUser?.name || null)) ||
          (f === "shared" && !b.owner_name)
      )
      .forEach((book) => {
        const el = document.createElement("div");
        el.className = "card";
        el.style.marginBottom = "8px";
        el.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>${book.title}</strong><div class="small muted">by ${
          book.author || "Unknown"
        }</div>
              <div class="small">${
                book.available
                  ? '<span style="color:var(--accent-3)">Available</span>'
                  : '<span style="color:var(--accent-2)">Rented</span>'
              }</div>
              ${
                book.owner_name
                  ? `<div class="small muted">Added by: ${book.owner_name}</div>`
                  : ""
              }
              ${
                book.borrower_name
                  ? `<div class="small muted">Borrowed by: ${book.borrower_name}</div>`
                  : ""
              }
            </div>
            <div style="min-width:160px;text-align:right">
              ${
                book.available
                  ? `<button class="rentBtn">Rent</button>`
                  : `<button class="returnBtn">Return</button>`
              }
              <button class="shareBtn">Share / Edit</button>
            </div>
          </div>
        `;
        el.querySelector(".rentBtn")?.addEventListener("click", () => {
          const borrower =
            prompt("Borrower name", currentUser?.name || "") ||
            currentUser?.name ||
            "Unknown";
          book.available = false;
          book.borrower_name = borrower;
          saveState(state);
          updateList();
          addActivity(`${borrower} rented "${book.title}"`);
        });
        el.querySelector(".returnBtn")?.addEventListener("click", () => {
          book.available = true;
          book.borrower_name = null;
          saveState(state);
          updateList();
          addActivity(`Returned "${book.title}"`);
        });
        el.querySelector(".shareBtn")?.addEventListener("click", () => {
          const t = prompt("Title", book.title);
          if (!t) return;
          const a = prompt("Author", book.author || "") || "";
          book.title = t;
          book.author = a;
          if (!book.owner_name) book.owner_name = currentUser?.name || null;
          saveState(state);
          updateList();
          addActivity(`Edited book "${book.title}"`);
        });
        list.appendChild(el);
      });
  }
  function addBook() {
    const title = prompt("Book title");
    if (!title) return;
    const author = prompt("Author") || "";
    const b = {
      id: Date.now(),
      title,
      author,
      available: true,
      owner_name: currentUser?.name || null,
    };
    state.books.push(b);
    saveState(state);
    renderLibrary();
    addActivity(`Added book "${title}"`);
  }
}

// Washing area UI
function renderWashing() {
  mainArea.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>Washing Area</h3>
    <div class="row" style="margin-top:8px;margin-bottom:10px">
      <button id="addMachineBtn">Add Machine</button>
      <button id="resetBtn" style="background:var(--accent-2)">Reset All</button>
    </div>
    <div id="machinesWrap" class="tiles"></div>
  `;
  mainArea.appendChild(card);

  document.getElementById("addMachineBtn").onclick = () => {
    const name = prompt("Machine name", "Washer X");
    if (!name) return;
    state.machines.push({
      id: Date.now(),
      name,
      busy: false,
      free_at: null,
      note: "",
    });
    saveState(state);
    renderMachines();
    addActivity(`Added machine ${name}`);
  };
  document.getElementById("resetBtn").onclick = () => {
    if (!confirm("Reset all machines?")) return;
    state.machines.forEach((m) => {
      m.busy = false;
      m.free_at = null;
      m.note = "";
    });
    saveState(state);
    renderMachines();
    addActivity("Reset all machines");
  };

  renderMachines();

  function renderMachines() {
    const wrap = document.getElementById("machinesWrap");
    wrap.innerHTML = "";
    state.machines.forEach((m) => {
      const el = document.createElement("div");
      el.className = "tile";
      el.innerHTML = `
        <img src="assets/cards/washing.jpg" onerror="this.src='https://via.placeholder.com/120x80/efe1c6/7a4a2a?text=Washer'"/>
        <div class="meta">
          <h4>${m.name}</h4>
          <p>${
            m.busy
              ? "Busy — " + (m.note || "")
              : "Free — " + (m.note || "No note")
          }</p>
          <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">
            ${
              m.busy
                ? `<button class="freeBtn">Mark Free</button>`
                : `<button class="useBtn">Use</button>`
            }
            <button class="noteBtn">Note</button>
          </div>
        </div>
      `;
      el.querySelector(".useBtn")?.addEventListener("click", () => {
        const duration = parseInt(prompt("Duration in minutes", "30")) || 30;
        m.busy = true;
        m.free_at = new Date(Date.now() + duration * 60000).toISOString();
        m.note = `Used by ${currentUser?.name || "someone"} for ${duration}m`;
        saveState(state);
        renderMachines();
        addActivity(`Reserved ${m.name} for ${duration}m`);
      });
      el.querySelector(".freeBtn")?.addEventListener("click", () => {
        m.busy = false;
        m.free_at = null;
        m.note = "";
        saveState(state);
        renderMachines();
        addActivity(`Freed ${m.name}`);
      });
      el.querySelector(".noteBtn")?.addEventListener("click", () => {
        const n = prompt("Note", m.note || "") || "";
        m.note = n;
        saveState(state);
        renderMachines();
        addActivity(`Updated note for ${m.name}`);
      });

      wrap.appendChild(el);

      // optional countdown if busy: update tile text (simpler approach: re-render every 10s)
      if (m.free_at) {
        setInterval(() => {
          // light-weight demo interval per machine
          const now = new Date(),
            free = new Date(m.free_at);
          if (now >= free) {
            m.busy = false;
            m.free_at = null;
            m.note = "";
            saveState(state);
            renderMachines();
          }
        }, 1000 * 10);
      }
    });
  }
}

// initial load
document.addEventListener("DOMContentLoaded", () => {
  if (state.users && state.users.length > 0) {
    currentUser = state.users[state.users.length - 1];
    userShort.textContent = `${currentUser.name} ${
      currentUser.roll ? "- " + currentUser.roll : ""
    }`;
  }
  showDashboard();
});
