// app.js — frontend connected to Node + Express + SQLite backend


// we still use localStorage only for: users, reports, activities
const STORAGE_KEY = "campus_frontend_state_v3";
const API_BASE = ""; // same origin: http://localhost:4000

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const init = {
      users: [],
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

// auth: token + user from backend
let auth = { token: null, user: null };

function loadAuth() {
  const raw = localStorage.getItem("auth");
  if (raw) {
    try {
      auth = JSON.parse(raw);
    } catch {
      auth = { token: null, user: null };
    }
  }
}

function saveAuth() {
  localStorage.setItem("auth", JSON.stringify(auth));
}

loadAuth();

// small helper to call backend (automatically attach token if present)
async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (auth.token) {
    headers["Authorization"] = "Bearer " + auth.token;
  }

  const res = await fetch(API_BASE + path, { ...options, headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}


// backend API wrapper
const api = {
  // BOOKS
  getBooks: (q = "") =>
    apiRequest("/api/books" + (q ? "?q=" + encodeURIComponent(q) : "")),
  addBook: ({ title, author, owner_name }) =>
    apiRequest("/api/books", {
      method: "POST",
      body: JSON.stringify({ title, author, owner_name }),
    }),
  rentBook: (id, borrower_name) =>
    apiRequest(`/api/books/${id}/rent`, {
      method: "POST",
      body: JSON.stringify({ borrower_name }),
    }),
  returnBook: (id) => apiRequest(`/api/books/${id}/return`, { method: "POST" }),

  // NEW: update book
  updateBook: (id, data) =>
    apiRequest(`/api/books/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // NEW: delete book
  deleteBook: (id) =>
    apiRequest(`/api/books/${id}`, {
      method: "DELETE",
    }),

  // MACHINES
  getMachines: () => apiRequest("/api/machines"),
  addMachine: (name) =>
    apiRequest("/api/machines", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  useMachine: (id, user, durationMinutes, note) =>
    apiRequest(`/api/machines/${id}/use`, {
      method: "POST",
      body: JSON.stringify({ user, durationMinutes, note }),
    }),
  freeMachine: (id) =>
    apiRequest(`/api/machines/${id}/free`, { method: "POST" }),

  // NEW: update machine
  updateMachine: (id, data) =>
    apiRequest(`/api/machines/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // NEW: delete machine
  deleteMachine: (id) =>
    apiRequest(`/api/machines/${id}`, {
      method: "DELETE",
    }),

  // SPORTS
  getSportsItems: () => apiRequest("/api/sports/items"),
  addSportsItem: (name, category, quantity) =>
    apiRequest("/api/sports/items", {
      method: "POST",
      body: JSON.stringify({ name, category, quantity }),
    }),
  updateSportsItem: (id, data) =>
    apiRequest(`/api/sports/items/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteSportsItem: (id) =>
    apiRequest(`/api/sports/items/${id}`, {
      method: "DELETE",
    }),
  useSportsItem: (id) =>
    apiRequest(`/api/sports/items/${id}/use`, {
      method: "POST",
    }),
  returnSportsItem: (id) =>
    apiRequest(`/api/sports/items/${id}/return`, {
      method: "POST",
    }),

  // Badminton
  getBadmintonSlots(dateStr) {
    const query = dateStr ? `?start=${encodeURIComponent(dateStr)}&days=1` : "";
    return apiRequest("/api/badminton/slots" + query);
  },
  bookBadminton: (slot_time) =>
    apiRequest("/api/badminton/book", {
      method: "POST",
      body: JSON.stringify({ slot_time }),
    }),
  cancelBooking: (id) =>
    apiRequest(`/api/badminton/bookings/${id}`, {
      method: "DELETE",
    }),
  getHolidays: () => apiRequest("/api/badminton/holidays"),
  addHoliday: (date, note = "") =>
    apiRequest("/api/badminton/holidays", {
      method: "POST",
      body: JSON.stringify({ date, note }),
    }),
  deleteHoliday: (id) =>
    apiRequest(`/api/badminton/holidays/${id}`, {
      method: "DELETE",
    }),
};

// ========== DOM refs ==========
const loginWrap = document.getElementById("loginWrap");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const openLogin = document.getElementById("openLogin");
const openDashboard = document.getElementById("openDashboard");
const nameInput = document.getElementById("nameInput");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const courseYearSelect = document.getElementById("courseYear");
const courseProgramSelect = document.getElementById("courseProgram");
const userShort = document.getElementById("userShort");
const mainArea = document.getElementById("mainArea");


// menu + modals
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

// ========== helpers for activity ==========
function addActivity(text) {
  state.activities.push({ text, at: new Date().toISOString() });
  saveState(state);
}

// ========== menu & login ==========

openLogin.onclick = () => {
  loginWrap.classList.remove("hidden");
};

openDashboard.onclick = () => showDashboard();

async function doRegister() {
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const course_year = courseYearSelect.value;
  const course_program = courseProgramSelect.value;

  if (!name || !email || !password) {
    alert("Name, email and password are required for register");
    return;
  }
  if (!course_year || !course_program) {
    alert("Please select course year and course type");
    return;
  }

  try {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        password,
        course_year,
        course_program,
      }),
    });

    auth = { token: data.token, user: data.user };
    saveAuth();

    currentUser = { id: data.user.id, name: data.user.name };
    userShort.textContent = `${data.user.name} (${data.user.role})`;

    loginWrap.classList.add("hidden");
    addActivity(
      `Registered as ${data.user.name} [${data.user.role}] ${
        data.user.course_year || ""
      } ${data.user.course_program || ""}`
    );
    showDashboard();
  } catch (err) {
    alert("Register error: " + err.message);
  }
}


async function doLogin() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    alert("Email and password are required");
    return;
  }

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    auth = { token: data.token, user: data.user };
    saveAuth();

    currentUser = { id: data.user.id, name: data.user.name };
    userShort.textContent = `${data.user.name} (${data.user.role})`;

    loginWrap.classList.add("hidden");
    addActivity(`Logged in as ${data.user.name} [${data.user.role}]`);
    showDashboard();
  } catch (err) {
    alert("Login error: " + err.message);
  }
}

registerBtn.onclick = () => {
  doRegister();
};
loginBtn.onclick = () => {
  doLogin();
};


function showProfile() {
  profileModal.classList.remove("hidden");

  if (!auth.user) {
    profileContent.innerHTML = "No user signed in";
    return;
  }

  const u = auth.user;
  profileContent.innerHTML = `
    <div><strong>${u.name}</strong></div>
    <div class="small muted">Email: ${u.email}</div>
    <div class="small muted">Role: ${u.role}</div>
    <div class="small muted">Year: ${u.course_year || "—"}</div>
    <div class="small muted">Program: ${u.course_program || "—"}</div>
  `;
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
      (a) => `<div style="margin-bottom:6px">
        <strong class="small">${a.text}</strong>
        <div class="small muted">${new Date(a.at).toLocaleString()}</div>
      </div>`
    )
    .join("");
}

// ========== Dashboard & module tiles ==========

function showDashboard() {
  mainArea.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>Dashboard</h3>
    <div class="tiles" id="tiles"></div>
    <div class="footer small muted" style="margin-top:14px">
      
    </div>
  `;
  mainArea.appendChild(card);

  const tiles = document.getElementById("tiles");
      const modules = [
        {
          id: "library",
          title: "Library",
          desc: "Manage books: add, rent, return ",
          img: "assets/cards/library.jpg",
        },
        {
          id: "washing",
          title: "Washing Area",
          desc: "See machine usage & reserve ",
          img: "assets/cards/washing.jpg",
        },
        {
          id: "badminton",
          title: "Badminton Court",
          desc: "Book slots for play ",
          img: "assets/cards/badminton.jpg",
        },
        {
          id: "sports",
          title: "Sports Items",
          desc: "Use and track sports equipment ",
          img: "assets/cards/sports.jpg",
        },
        {
          id: "notices",
          title: "Notice Board",
          desc: "Notices, menus and upcoming events",
          img: "assets/cards/food.jpg",
        },
        {
          id: "pyqs",
          title: "PYQs",
          desc: "Previous year question papers",
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
      else if (m.id === "badminton") renderBadminton();
      else if (m.id === "sports") renderSports();
      else if (m.id === "pyqs") renderPyqs();
      else alert("Coming soon — will be added later");
    });
    tiles.appendChild(el);
  });
}

// ========== Library (uses backend) ==========

// ========== Library (uses backend, full CRUD) ==========
// ========== Library (uses backend, full CRUD, owner rules, last 3 users) ==========
async function renderLibrary() {
  if (!auth.user) {
    alert("Please sign in to use the Library.");
    loginWrap.classList.remove("hidden");
    return;
  }
  mainArea.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>Library</h3>
    <div class="row" style="gap:8px;margin-top:8px;">
      <input id="q" placeholder="Search title or author" />
      <select id="filterOwner">
        <option value="all">All</option>
        <option value="mine">My Books</option>
        <option value="shared">Shared</option>
      </select>
      <button id="addBookBtn">Add Book</button>
    </div>
    <div id="bookList" style="margin-top:12px"></div>
  `;
  mainArea.appendChild(card);

  const qInput = document.getElementById('q');
  const filterSel = document.getElementById('filterOwner');
  const list = document.getElementById('bookList');

  document.getElementById('addBookBtn').onclick = async () => {
    const title = prompt('Book title');
    if (!title) return;
    const author = prompt('Author') || '';
    try {
      await api.addBook({
        title,
        author
        // owner is taken from auth.user in backend now
      });
      addActivity(`Added book "${title}"`);
      await updateList();
    } catch (err) {
      alert('Error adding book: ' + err.message);
    }
  };

  qInput.addEventListener('input', () => updateList());
  filterSel.addEventListener('change', () => updateList());

  async function updateList() {
    try {
      const q = qInput.value;
      const f = filterSel.value;

      const userId = auth.user ? auth.user.id : null;
      const isAdmin = auth.user && auth.user.role === 'admin';

      let books = await api.getBooks(q);

      // filter by owner using owner_id
      books = books.filter(b => {
        if (f === 'all') return true;
        if (f === 'mine') return userId && b.owner_id === userId;
        if (f === 'shared') return !b.owner_id;
        return true;
      });

      list.innerHTML = '';
      books.forEach(book => {
        const canModify = isAdmin || (userId && book.owner_id === userId);

        const el = document.createElement('div');
        el.className = 'card';
        el.style.marginBottom = '8px';
        el.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>${book.title}</strong>
              <div class="small muted">by ${book.author || 'Unknown'}</div>
              <div class="small">
                ${
                  book.available
                    ? '<span style="color:var(--accent-3)">Available</span>'
                    : '<span style="color:var(--accent-2)">Rented</span>'
                }
              </div>
              ${
                book.owner_name
                  ? `<div class="small muted">Added by: ${book.owner_name}</div>`
                  : ''
              }
              ${
                book.borrower_name
                  ? `<div class="small muted">Borrowed by: ${book.borrower_name}</div>`
                  : ''
              }
              ${
                book.last_users && book.last_users.length
                  ? `
                    <div class="small muted">
                      Last users:
                      ${book.last_users
                        .map(
                          u =>
                            `${u.user_name} (${new Date(
                              u.at
                            ).toLocaleDateString()})`
                        )
                        .join(', ')}
                    </div>
                  `
                  : ''
              }
            </div>
            <div style="min-width:210px;text-align:right;display:flex;flex-direction:column;gap:4px;align-items:flex-end">
              <div>
                ${
                  book.available
                    ? `<button class="rentBtn">Rent</button>`
                    : `<button class="returnBtn">Return</button>`
                }
              </div>
              <div>
                ${
                  canModify
                    ? `
                      <button class="editBtn secondary">Edit</button>
                      <button class="deleteBtn" style="background:#b91c1c;color:#fff">Delete</button>
                    `
                    : ''
                }
              </div>
            </div>
          </div>
        `;

        // Rent – any logged-in user can rent
        el.querySelector('.rentBtn')?.addEventListener('click', async () => {
          const borrower =
            prompt('Borrower name', auth.user?.name || '') ||
            auth.user?.name ||
            'Unknown';
          try {
            await api.rentBook(book.id, borrower);
            addActivity(`${borrower} rented "${book.title}"`);
            await updateList();
          } catch (err) {
            alert('Error renting: ' + err.message);
          }
        });

        // Return – any logged-in user can return
        el.querySelector('.returnBtn')?.addEventListener('click', async () => {
          try {
            await api.returnBook(book.id);
            addActivity(`Returned "${book.title}"`);
            await updateList();
          } catch (err) {
            alert('Error returning: ' + err.message);
          }
        });

        // Edit – only owner or admin
        if (canModify) {
          el.querySelector('.editBtn')?.addEventListener('click', async () => {
            const newTitle =
              prompt('Title', book.title) || book.title;
            const newAuthor =
              prompt('Author', book.author || '') ||
              book.author ||
              '';
            try {
              await api.updateBook(book.id, {
                title: newTitle,
                author: newAuthor
              });
              addActivity(`Edited book "${newTitle}"`);
              await updateList();
            } catch (err) {
              alert('Error updating book: ' + err.message);
            }
          });

          // Delete – only owner or admin
          el.querySelector('.deleteBtn')?.addEventListener(
            'click',
            async () => {
              if (
                !confirm(
                  `Delete book "${book.title}"? This cannot be undone.`
                )
              )
                return;
              try {
                await api.deleteBook(book.id);
                addActivity(`Deleted book "${book.title}"`);
                await updateList();
              } catch (err) {
                alert('Error deleting book: ' + err.message);
              }
            }
          );
        }

        list.appendChild(el);
      });
    } catch (err) {
      list.innerHTML =
        '<div class="small muted">Error loading books: ' +
        err.message +
        '</div>';
    }
  }

  await updateList();
}



// ========== Washing Area (uses backend) ==========


// ========== Washing Area (full CRUD + admin controls + status) ==========
async function renderWashing() {
  if (!auth.user) {
    alert("Please sign in to use the Washing Area.");
    loginWrap.classList.remove("hidden");
    return;
  }
  
  mainArea.innerHTML = '';
  const isAdmin = auth.user && auth.user.role === 'admin';

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>Washing Area</h3>
    <div class="row" style="margin-top:8px;margin-bottom:10px">
      ${isAdmin ? `
        <button id="addMachineBtn">Add Machine</button>
        <button id="resetAllBtn" class="secondary">Reset All</button>
      ` : ''}
    </div>
    <div id="machinesWrap" class="tiles"></div>
  `;
  mainArea.appendChild(card);

  const wrap = document.getElementById('machinesWrap');

  // Admin-only buttons
  if (isAdmin) {
    document.getElementById('addMachineBtn').onclick = async () => {
      const name = prompt('Machine name', 'Washer X');
      if (!name) return;
      try {
        await api.addMachine(name);
        addActivity(`Admin added machine ${name}`);
        await loadMachines();
      } catch (err) {
        alert('Error adding machine: ' + err.message);
      }
    };

    document.getElementById('resetAllBtn').onclick = async () => {
      if (!confirm('Reset all machines to Free?')) return;
      try {
        const machines = await api.getMachines();
        for (const m of machines) {
          await api.freeMachine(m.id);
        }
        addActivity('Admin reset all machines');
        await loadMachines();
      } catch (err) {
        alert('Error resetting: ' + err.message);
      }
    };
  }

  async function loadMachines() {
    try {
      const machines = await api.getMachines();
      wrap.innerHTML = '';

      const now = Date.now();

      machines.forEach(m => {
        const el = document.createElement('div');
        const isOverdue =
          m.busy && m.free_at && new Date(m.free_at).getTime() < now;

        el.className = 'tile';
        el.innerHTML = `
          <img src="assets/cards/washing.jpg"
               onerror="this.src='https://via.placeholder.com/120x80/efe1c6/7a4a2a?text=Washing'"/>
          <div class="meta">
            <h4>${m.name}</h4>

            <div class="small muted">
              Status: ${
                m.busy
                  ? (isOverdue ? 'Busy (TIME OVER)' : 'Busy')
                  : 'Free'
              } — ${m.status || 'working'}
            </div>

            <div class="small muted">
              Note: ${m.note || 'No note'}
            </div>

            <div class="small muted">
              ${
                m.free_at
                  ? (isOverdue
                      ? 'Was supposed to be free at: ' +
                        new Date(m.free_at).toLocaleTimeString() +
                        ' (time over)'
                      : 'Will be free around: ' +
                        new Date(m.free_at).toLocaleTimeString())
                  : ''
              }
            </div>

            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              ${
                m.busy
                  ? `<button class="freeBtn">Mark Free</button>`
                  : `<button class="useBtn">Use</button>`
              }

              <button class="noteBtn secondary">Add Note</button>

              ${
                isAdmin
                  ? `
                    <button class="statusBtn secondary">Set Status</button>
                    <button class="editBtn secondary">Rename</button>
                    <button class="deleteBtn" style="background:#b91c1c;color:#fff">Delete</button>
                  `
                  : ''
              }
            </div>
          </div>
        `;

        // Use machine (student + admin)
        el.querySelector('.useBtn')?.addEventListener('click', async () => {
          const duration = parseInt(prompt('Duration in minutes', '30'), 10) || 30;
          try {
            await api.useMachine(
              m.id,
              auth.user?.name || 'someone',
              duration,
              `Used by ${auth.user?.name || 'someone'} for ${duration}m`
            );
            addActivity(`Reserved ${m.name} for ${duration}m`);
            await loadMachines();
          } catch (err) {
            alert('Error using machine: ' + err.message);
          }
        });

        // Mark free (student + admin)
        el.querySelector('.freeBtn')?.addEventListener('click', async () => {
          try {
            await api.freeMachine(m.id);
            addActivity(`Freed ${m.name}`);
            await loadMachines();
          } catch (err) {
            alert('Error freeing machine: ' + err.message);
          }
        });

        // Add / update note (student + admin)
        el.querySelector('.noteBtn')?.addEventListener('click', async () => {
          const n = prompt('Note', m.note || '') || '';
          try {
            await api.updateMachine(m.id, { note: n });
            addActivity(`Updated note for ${m.name}`);
            await loadMachines();
          } catch (err) {
            alert('Error updating note: ' + err.message);
          }
        });

        if (isAdmin) {
          // Set status (admin only)
          el.querySelector('.statusBtn')?.addEventListener('click', async () => {
            const s = prompt(
              'Status (working / not working / damaged)',
              m.status || 'working'
            );
            if (!s) return;
            try {
              await api.updateMachine(m.id, { status: s });
              addActivity(`Admin set status of ${m.name} to ${s}`);
              await loadMachines();
            } catch (err) {
              alert('Error setting status: ' + err.message);
            }
          });

          // Rename (admin only)
          el.querySelector('.editBtn')?.addEventListener('click', async () => {
            const newName = prompt('New name', m.name) || m.name;
            try {
              await api.updateMachine(m.id, { name: newName });
              addActivity(`Admin renamed machine to ${newName}`);
              await loadMachines();
            } catch (err) {
              alert('Error renaming: ' + err.message);
            }
          });

          // Delete (admin only)
          el.querySelector('.deleteBtn')?.addEventListener('click', async () => {
            if (!confirm(`Delete machine "${m.name}"?`)) return;
            try {
              await api.deleteMachine(m.id);
              addActivity(`Admin deleted machine ${m.name}`);
              await loadMachines();
            } catch (err) {
              alert('Error deleting machine: ' + err.message);
            }
          });
        }

        wrap.appendChild(el);
      });
    } catch (err) {
      wrap.innerHTML =
        '<div class="small muted">Error loading machines: ' + err.message + '</div>';
    }
  }

  await loadMachines();
}

// ========== Badminton (date-based, nicer UI, admin click name to remove) ==========
async function renderBadminton() {
  if (!auth.user) {
    alert("Please login first to book badminton slots.");
    loginWrap.classList.remove("hidden");
    return;
  }

  mainArea.innerHTML = "";

  const isAdmin = auth.user && auth.user.role === "admin";

  const container = document.createElement("div");
  container.className = "card";
  container.style.maxWidth = "700px";
  container.style.margin = "0 auto";
  container.innerHTML = `
    <h3 style="text-align:center;">Badminton Court – Book Slot</h3>

    <div style="margin:12px 0; text-align:center;">
      <label class="small muted">Select a date (today or next 2 days)</label><br/>
      <input id="bdmDate" type="date" />
      <button id="loadSlotsBtn" style="margin-left:8px;">Show Slots</button>
      ${
        isAdmin
          ? `<button id="viewHolidays" class="secondary" style="margin-left:8px;">Manage Holidays</button>`
          : ""
      }
    </div>

    <div id="slotsWrap" class="tiles" style="margin-top:12px;"></div>
  `;
  mainArea.appendChild(container);

  const dateInput = document.getElementById("bdmDate");
  const loadBtn = document.getElementById("loadSlotsBtn");
  const slotsWrap = document.getElementById("slotsWrap");

  // default date = today
  const today = new Date();
  dateInput.value = today.toISOString().slice(0, 10);

  if (isAdmin) {
    document.getElementById("viewHolidays").onclick = () => renderHolidays();
  }

  loadBtn.onclick = () => loadSlotsForDate(dateInput.value);

  async function loadSlotsForDate(dateStr) {
    if (!dateStr) {
      alert("Please select a date");
      return;
    }

    slotsWrap.innerHTML =
      '<div class="small muted">Loading slots for ' + dateStr + '...</div>';

    try {
      const slots = await api.getBadmintonSlots(dateStr); // we will adjust API wrapper
      if (!slots || slots.length === 0) {
        slotsWrap.innerHTML =
          '<div class="small muted">No slots available for this date.</div>';
        return;
      }

      slotsWrap.innerHTML = "";

      slots.forEach((slot) => {
        const time = new Date(slot.slot_time);
        const tStr = time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        const userAlreadyBooked = slot.users.some(
          (u) => u.user_id === auth.user.id
        );
        const canBook = slot.remaining > 0 && !userAlreadyBooked;

        const tile = document.createElement("div");
        tile.className = "tile";
        tile.innerHTML = `
          <div class="meta">
            <h4>${tStr}</h4>
            <div class="small muted">Users (${slot.users.length}/6)</div>
            <div class="small">
              ${
                slot.users.length === 0
                  ? "No one booked yet"
                  : slot.users
                      .map(
                        (u) =>
                          `<span class="bdmUser" data-booking="${u.booking_id}">
                             ${u.user_name}
                           </span>`
                      )
                      .join(", ")
              }
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              ${
                userAlreadyBooked
                  ? `<button class="cancelBtn">Cancel My Slot</button>`
                  : canBook
                  ? `<button class="bookBtn">Book this slot</button>`
                  : `<span class="small muted">Full / Not available</span>`
              }
            </div>
            ${
              isAdmin && slot.users.length > 0
                ? `<div class="small muted" style="margin-top:6px;">
                     Admin: click a name above to remove that booking.
                   </div>`
                : ""
            }
          </div>
        `;

        // Book
        tile.querySelector(".bookBtn")?.addEventListener("click", async () => {
          try {
            await api.bookBadminton(slot.slot_time);
            addActivity(`Booked badminton slot ${dateStr} ${tStr}`);
            loadSlotsForDate(dateStr);
          } catch (err) {
            alert(err.message);
          }
        });

        // Cancel own booking
        tile.querySelector(".cancelBtn")?.addEventListener("click", async () => {
          const booking = slot.users.find((u) => u.user_id === auth.user.id);
          if (!booking) return;
          try {
            await api.cancelBooking(booking.booking_id);
            addActivity(`Cancelled badminton booking ${dateStr} ${tStr}`);
            loadSlotsForDate(dateStr);
          } catch (err) {
            alert(err.message);
          }
        });

        // Admin: click on name to remove
        if (isAdmin) {
          tile.querySelectorAll(".bdmUser").forEach((span) => {
            span.style.cursor = "pointer";
            span.title = "Click to remove this booking";
            span.addEventListener("click", async () => {
              const bookingId = Number(span.getAttribute("data-booking"));
              if (!confirm(`Remove this booking (${span.textContent.trim()})?`))
                return;
              try {
                await api.cancelBooking(bookingId);
                addActivity(
                  `Admin removed booking ${bookingId} at ${dateStr} ${tStr}`
                );
                loadSlotsForDate(dateStr);
              } catch (err) {
                alert(err.message);
              }
            });
          });
        }

        slotsWrap.appendChild(tile);
      });
    } catch (err) {
      slotsWrap.innerHTML = `<div class="small muted">Error: ${err.message}</div>`;
    }
  }

  // initial load for today
  loadSlotsForDate(dateInput.value);
}


// ========== Badminton Holidays Management (Admin) ==========
async function renderHolidays() {
  
  if (!auth.user || auth.user.role !== "admin") {
    alert("Only admin can manage holidays.");
    return;
  }

  mainArea.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>Manage Holidays</h3>

    <div style="margin-top:10px;margin-bottom:10px">
      <input id="holidayDate" type="date" />
      <input id="holidayNote" placeholder="Note (optional)" />
      <button id="addHolidayBtn">Add Holiday</button>
    </div>

    <div id="holidayList"></div>

    <div style="margin-top:10px">
      <button id="backBtn" class="secondary">Back</button>
    </div>
  `;

  mainArea.appendChild(card);

  document.getElementById("backBtn").onclick = () => renderBadminton();

  document.getElementById("addHolidayBtn").onclick = async () => {
    const d = document.getElementById("holidayDate").value;
    const n = document.getElementById("holidayNote").value;
    if (!d) return alert("Select a date");

    try {
      await api.addHoliday(d, n);
      loadHolidays();
    } catch (err) {
      alert(err.message);
    }
  };

  loadHolidays();
}

async function loadHolidays() {
  const list = document.getElementById("holidayList");
  list.innerHTML = "Loading...";

  try {
    const days = await api.getHolidays();
    list.innerHTML = "";

    days.forEach((day) => {
      const el = document.createElement("div");
      el.className = "small card";
      el.style.margin = "5px";
      el.innerHTML = `
        <div>
          <strong>${day.date}</strong> — ${day.note || ""}
          <button class="delBtn" style="float:right;background:#b91c1c;color:white">X</button>
        </div>
      `;

      el.querySelector(".delBtn").onclick = async () => {
        try {
          await api.deleteHoliday(day.id);
          loadHolidays();
        } catch (err) {
          alert(err.message);
        }
      };

      list.appendChild(el);
    });
  } catch (err) {
    list.innerHTML = err.message;
  }
}

// ========== Sports Items (quantity + category filter) ==========
async function renderSports() {
  if (!auth.user) {
    alert("Please login first to use sports items.");
    loginWrap.classList.remove("hidden");
    return;
  }

  mainArea.innerHTML = "";
  const isAdmin = auth.user && auth.user.role === "admin";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>Sports Items</h3>
    <div class="row" style="margin-top:8px;margin-bottom:10px;gap:8px;">
      <select id="sportsFilter">
        <option value="">All categories</option>
        <option value="Cricket">Cricket</option>
        <option value="Football">Football</option>
        <option value="Volleyball">Volleyball</option>
        <option value="Badminton">Badminton</option>
        <option value="Gym">Gym</option>
      </select>
      ${
        isAdmin
          ? `<button id="addItemBtn">Add Item</button>`
          : ""
      }
    </div>
    <div id="sportsList" class="tiles"></div>
  `;
  mainArea.appendChild(card);

  const list = document.getElementById("sportsList");
  const filterSel = document.getElementById("sportsFilter");

  if (isAdmin) {
    document.getElementById("addItemBtn").onclick = async () => {
      const name = prompt("Item name (e.g. Volleyball)");
      if (!name) return;
      const category =
        prompt("Category (e.g. Volleyball, Cricket, Football)") || "";
      const qtyStr = prompt("Quantity", "1");
      const qty = parseInt(qtyStr, 10) || 1;
      try {
        await api.addSportsItem(name, category, qty);
        addActivity(`Admin added sports item "${name}" (x${qty})`);
        await loadItems();
      } catch (err) {
        alert("Error adding item: " + err.message);
      }
    };
  }

  filterSel.addEventListener("change", () => loadItems());

  async function loadItems() {
    list.innerHTML = '<div class="small muted">Loading items...</div>';

    try {
      let items = await api.getSportsItems();
      const f = filterSel.value;
      if (f) {
        items = items.filter(
          (i) =>
            (i.category || "")
              .toLowerCase()
              .includes(f.toLowerCase())
        );
      }

      list.innerHTML = "";

      if (items.length === 0) {
        list.innerHTML =
          '<div class="small muted">No sports items yet.</div>';
        return;
      }

      items.forEach((item) => {
        const el = document.createElement("div");
        el.className = "tile";

        const qty = item.quantity || 1;
        const used = item.in_use_count || 0;
        const free = Math.max(0, qty - used);
        const inUse = used > 0;

        const inTime = item.last_in_time
          ? new Date(item.last_in_time)
          : null;

        el.innerHTML = `
          <div class="meta">
            <h4>${item.name}</h4>
            <div class="small muted">
              ${item.category ? "Category: " + item.category : ""}
            </div>

            <div class="small">
              Quantity: ${qty}
              ${
                inUse
                  ? `<span style="color:var(--accent-2);margin-left:6px;">${used} in use</span>`
                  : ""
              }
              ${
                free > 0
                  ? `<span style="color:var(--accent-3);margin-left:6px;">${free} free</span>`
                  : free === 0
                  ? `<span class="small muted" style="margin-left:6px;">All in use</span>`
                  : ""
              }
            </div>

            ${
              inTime
                ? `<div class="small muted">
                    Last returned at ${inTime.toLocaleString()}
                   </div>`
                : ""
            }

            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              ${
                free > 0
                  ? `<button class="useBtn">Use one</button>`
                  : ""
              }

              ${
                inUse
                  ? `<button class="returnBtn">Return one</button>`
                  : ""
              }

              ${
                isAdmin
                  ? `
                    <button class="editBtn secondary">Edit</button>
                    <button class="deleteBtn" style="background:#b91c1c;color:#fff">Delete</button>
                  `
                  : ""
              }
            </div>
          </div>
        `;

        // Use one (if free)
        el.querySelector(".useBtn")?.addEventListener("click", async () => {
          try {
            await api.useSportsItem(item.id);
            addActivity(
              `${auth.user.name} used one "${item.name}"`
            );
            await loadItems();
          } catch (err) {
            alert("Error using item: " + err.message);
          }
        });

        // Return one (if any in use)
        el.querySelector(".returnBtn")?.addEventListener("click", async () => {
          try {
            await api.returnSportsItem(item.id);
            addActivity(
              `${auth.user.name} returned one "${item.name}"`
            );
            await loadItems();
          } catch (err) {
            alert("Error returning item: " + err.message);
          }
        });

        if (isAdmin) {
          // Edit
          el.querySelector(".editBtn")?.addEventListener("click", async () => {
            const newName =
              prompt("New name", item.name) || item.name;
            const newCat =
              prompt("New category", item.category || "") ||
              item.category ||
              "";
            const newQtyStr = prompt(
              "New quantity",
              String(item.quantity || 1)
            );
            const newQty = parseInt(newQtyStr, 10) || (item.quantity || 1);
            if (newQty < (item.in_use_count || 0)) {
              alert(
                "Quantity cannot be less than number currently in use."
              );
              return;
            }

            try {
              await api.updateSportsItem(item.id, {
                name: newName,
                category: newCat,
                quantity: newQty,
              });
              addActivity(`Admin edited sports item "${newName}"`);
              await loadItems();
            } catch (err) {
              alert("Error editing item: " + err.message);
            }
          });

          // Delete
          el.querySelector(".deleteBtn")?.addEventListener(
            "click",
            async () => {
              if (
                !confirm(
                  `Delete sports item "${item.name}"? This cannot be undone.`
                )
              )
                return;
              try {
                await api.deleteSportsItem(item.id);
                addActivity(`Admin deleted sports item "${item.name}"`);
                await loadItems();
              } catch (err) {
                alert("Error deleting item: " + err.message);
              }
            }
          );
        }

        list.appendChild(el);
      });
    } catch (err) {
      list.innerHTML =
        '<div class="small muted">Error loading items: ' +
        err.message +
        "</div>";
    }
  }

  await loadItems();
}

// ========== PYQs (coming soon screen with sem & course) ==========
async function renderPyqs() {
  if (!auth.user) {
    alert("Please sign in to view PYQs.");
    loginWrap.classList.remove("hidden");
    return;
  }

  mainArea.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>Previous Year Question Papers (PYQs)</h3>
    <p class="small muted" style="margin-top:4px;">
      Select your semester and course to view question papers.
    </p>

    <div class="row" style="margin-top:14px; gap:12px; flex-wrap:wrap;">
      <div style="flex:1; min-width:160px;">
        <label class="small muted">Semester</label>
        <select id="pyqSem">
          <option value="">Select semester</option>
          <option value="1st Sem">1st Sem</option>
          <option value="2nd Sem">2nd Sem</option>
          <option value="3rd Sem">3rd Sem</option>
          <option value="4th Sem">4th Sem</option>
          <option value="5th Sem">5th Sem</option>
          <option value="6th Sem">6th Sem</option>
          <option value="7th Sem">7th Sem</option>
          <option value="8th Sem">8th Sem</option>
        </select>
      </div>

      <div style="flex:1; min-width:160px;">
        <label class="small muted">Course</label>
        <select id="pyqCourse">
          <option value="">Select course</option>
          <option value="B.Tech">B.Tech</option>
          <option value="B.Sc">B.Sc</option>
        </select>
      </div>
    </div>

    <div class="row right" style="margin-top:14px;">
      <button id="pyqOpenBtn">Open</button>
    </div>

    <div id="pyqResult" style="margin-top:18px;">
      <div class="small muted">
        Please select semester and course, then click <strong>Open</strong>.
      </div>
    </div>
  `;

  mainArea.appendChild(card);

  const semSelect = document.getElementById("pyqSem");
  const courseSelect = document.getElementById("pyqCourse");
  const openBtn = document.getElementById("pyqOpenBtn");
  const resultBox = document.getElementById("pyqResult");

  openBtn.onclick = () => {
    const sem = semSelect.value;
    const course = courseSelect.value;

    if (!sem || !course) {
      alert("Please select both semester and course.");
      return;
    }

    // For now just show Coming Soon message
    resultBox.innerHTML = `
      <div class="card" style="background:#36322f; border-radius:10px; padding:14px; margin-top:6px;">
        <div><strong>${course} – ${sem}</strong></div>
        <div class="small muted" style="margin-top:4px;">
          PYQs for this combination will be uploaded soon.<br/>
          <span class="small">Please check again later.</span>
        </div>
      </div>
    `;

    addActivity(`Checked PYQs for ${course} – ${sem} (coming soon).`);
  };
}

