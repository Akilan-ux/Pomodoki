// Full Name: [Name]
// File Name: script.js
//
// Declaration: This is my own program. I did use AI to coach me.
//              I did not copy anyone's work.
//
// Objective: Runs the Pomodoki focus timer. Keeps the timer state, saves
//            everything to localStorage, and switches between the theme,
//            sound, task, stat and settings panels in the side drawer.

// ------------------------------------------- DATA / MANIFEST -------------------------------------------
// Drop your own files into /images and /audio, then edit the MANIFEST below
// so each entry's "file" matches your filename. Nothing here needs a build
// step - just open index.html.

var MANIFEST = {
    themes: [
        { id: "forest", name: "Forest", file: "images/forest.jpg" },
        { id: "rain", name: "Rainy window", file: "images/rain.jpg" },
        { id: "night-city", name: "Night city", file: "images/night-city.jpg" },
        { id: "SLC", name: "SLC ", file: "images/SLC.jpg" },
        { id: "cafe", name: "Cafe", file: "images/cafe.jpg" },
        { id: "ocean", name: "Ocean", file: "images/ocean.jpg" }
    ],
    sounds: [
        { id: "rain", name: "Rain", file: "audio/rain.mp3" },
        { id: "forest", name: "Forest birds", file: "audio/forest.mp3" },
        { id: "cafe", name: "Cafe hum", file: "audio/cafe.mp3" },
        { id: "fire", name: "Fireplace", file: "audio/fire.mp3" },
        { id: "waves", name: "Ocean waves", file: "audio/waves.mp3" },
        { id: "wind", name: "Wind", file: "audio/wind.mp3" }
    ],
    alerts: [
        { id: "chime", name: "Chime", file: "audio/chime.mp3" },
        { id: "bell", name: "Bell", file: "audio/bell.mp3" },
        { id: "marimba", name: "Marimba", file: "audio/marimba.mp3" }
    ]
};

var MODE_LABEL = { focus: "Focus", short: "Short break", long: "Long break" };
var RING_CIRCUMFERENCE = 615.75; // 2 * PI * 98, matches the SVG radius in style.css

// ------------------------------------------- PERSISTED STATE -------------------------------------------
var DEFAULT_SETTINGS = {
    focus: 25,
    short: 5,
    long: 15,
    sessionsBeforeLong: 4,
    alertSound: "chime",
    alertVolume: 0.7
};

// A func to load the saved state from localStorage. Falls back to the
// defaults if nothing is saved yet, or if the saved data is corrupted.
function loadState() {
    var saved = {};
    try {
        saved = JSON.parse(localStorage.getItem("embers.state") || "{}");
    } catch (e) {
        saved = {};
    }

    var settings = {};
    for (var key in DEFAULT_SETTINGS) {
        settings[key] = DEFAULT_SETTINGS[key];
    }
    if (saved.settings) {
        for (var savedKey in saved.settings) {
            settings[savedKey] = saved.settings[savedKey];
        }
    }

    return {
        settings: settings,
        theme: saved.theme || "forest",
        tasks: saved.tasks || [],
        stats: saved.stats || {},
        soundVolumes: saved.soundVolumes || {}
    };
}

// A func to save the current state back to localStorage
function saveState() {
    localStorage.setItem("embers.state", JSON.stringify({
        settings: state.settings,
        theme: state.theme,
        tasks: state.tasks,
        stats: state.stats,
        soundVolumes: state.soundVolumes
    }));
}

var state = loadState();

// ------------------------------------------- TIMER RUNTIME (not persisted) -------------------------------------------
var timer = {
    mode: "focus",
    secondsLeft: state.settings.focus * 60,
    totalSeconds: state.settings.focus * 60,
    running: false,
    cyclePos: 0, // focus sessions completed since last long break
    intervalId: null
};

// ------------------------------------------- DOM REFS -------------------------------------------
var el = {
    app: document.querySelector(".app"),
    scene: document.getElementById("scene"),
    layerA: document.querySelector(".scene__layer--a"),
    layerB: document.querySelector(".scene__layer--b"),
    modes: document.querySelectorAll(".mode"),
    time: document.getElementById("timeDisplay"),
    startBtn: document.getElementById("startBtn"),
    startLabel: document.getElementById("startLabel"),
    resetBtn: document.getElementById("resetBtn"),
    dots: document.getElementById("sessionDots"),
    dockBtns: document.querySelectorAll(".dock__btn"),
    drawer: document.getElementById("drawer"),
    drawerOverlay: document.getElementById("drawerOverlay"),
    drawerTitle: document.getElementById("drawerTitle"),
    drawerSubtitle: document.getElementById("drawerSubtitle"),
    drawerBody: document.getElementById("drawerBody"),
    drawerClose: document.getElementById("drawerClose"),
    settingsBtn: document.getElementById("settingsBtn")
};

var activeLayer = "a"; // which scene layer currently holds the visible image

// ------------------------------------------- SCENE / THEME -------------------------------------------
// A func to swap the background scene to a new theme. Crossfades between
// the two layers so the change doesn't pop.
function applyTheme(themeId, options) {
    options = options || {};

    var theme = null;
    for (var i = 0; i < MANIFEST.themes.length; i++) {
        if (MANIFEST.themes[i].id === themeId) {
            theme = MANIFEST.themes[i];
            break;
        }
    }
    if (!theme) {
        theme = MANIFEST.themes[0];
    }

    el.scene.dataset.theme = theme.id;
    state.theme = theme.id;

    var showLayer = activeLayer === "a" ? el.layerB : el.layerA;
    var hideLayer = activeLayer === "a" ? el.layerA : el.layerB;

    var img = new Image();
    img.onload = function () {
        showLayer.style.backgroundImage = "url(\"" + theme.file + "\")";
        showLayer.style.opacity = "1";
        hideLayer.style.opacity = "0";
        activeLayer = activeLayer === "a" ? "b" : "a";
    };
    img.onerror = function () {
        // no file at that path yet - the CSS fallback gradient for this
        // theme (see style.css) stays visible instead.
        showLayer.style.backgroundImage = "none";
        hideLayer.style.opacity = "0";
    };
    img.src = theme.file;

    if (options.instant) {
        showLayer.style.transition = "none";
        requestAnimationFrame(function () {
            showLayer.style.transition = "";
        });
    }
    saveState();
    renderThemeGrid();
}

// ------------------------------------------- TIMER -------------------------------------------
// A func to get the length of a mode in seconds
function modeSeconds(mode) {
    return state.settings[mode] * 60;
}

// A func to switch the active timer mode and (optionally) reset the clock
function setMode(mode, options) {
    options = options || {};
    var resetTime = options.resetTime !== false;

    timer.mode = mode;
    el.app.dataset.mode = mode;

    for (var i = 0; i < el.modes.length; i++) {
        var btn = el.modes[i];
        var selected = btn.dataset.mode === mode;
        btn.setAttribute("aria-selected", String(selected));
    }

    if (resetTime) {
        timer.totalSeconds = modeSeconds(mode);
        timer.secondsLeft = timer.totalSeconds;
    }
    renderTime();
    renderDots();
}

// A func to render the mm:ss countdown and update the page title
function renderTime() {
    var m = Math.floor(timer.secondsLeft / 60).toString().padStart(2, "0");
    var s = Math.floor(timer.secondsLeft % 60).toString().padStart(2, "0");
    el.time.textContent = m + ":" + s;
    if (timer.running) {
        document.title = m + ":" + s + " · " + MODE_LABEL[timer.mode] + " — Pomodoki";
    } else {
        document.title = "Pomodoki — a focus timer";
    }
}

// A func to draw the session dots (filled = completed session this cycle)
function renderDots() {
    var total = state.settings.sessionsBeforeLong;
    el.dots.innerHTML = "";
    for (var i = 0; i < total; i++) {
        var dot = document.createElement("span");
        if (i < timer.cyclePos) {
            dot.classList.add("filled");
        }
        el.dots.appendChild(dot);
    }
}

// A func that runs every second while the timer is active
function tick() {
    timer.secondsLeft -= 1;
    if (timer.secondsLeft <= 0) {
        completeSession();
        return;
    }
    renderTime();
}

// A func to handle what happens when a session (focus or break) finishes
function completeSession() {
    playAlert();

    if (timer.mode === "focus") {
        timer.cyclePos += 1;
        logStat();
        if (timer.cyclePos >= state.settings.sessionsBeforeLong) {
            timer.cyclePos = 0;
            setMode("long");
        } else {
            setMode("short");
        }
    } else {
        setMode("focus");
    }
    renderDots();
    stopRunning();
    // Timer stays paused here - the user presses start to begin
    // the next session (focus or break) whenever they're ready.
}

// A func to start the countdown ticking
function startRunning() {
    if (timer.running) {
        return;
    }
    timer.running = true;
    el.startLabel.textContent = "Pause";
    timer.intervalId = setInterval(tick, 1000);
    renderTime();
}

// A func to stop the countdown ticking
function stopRunning() {
    timer.running = false;
    el.startLabel.textContent = "Start";
    clearInterval(timer.intervalId);
}

// A func to flip between running and paused
function toggleRunning() {
    if (timer.running) {
        stopRunning();
    } else {
        startRunning();
    }
}

// A func to reset the clock back to the full length of the current mode
function resetTimer() {
    stopRunning();
    timer.secondsLeft = modeSeconds(timer.mode);
    timer.totalSeconds = timer.secondsLeft;
    renderTime();
}

// A func to skip straight to the end of the current session
function skipSession() {
    stopRunning();
    timer.secondsLeft = 0;
    completeSession();
}

// A func to play the chosen alert sound when a session ends
function playAlert() {
    var alertDef = null;
    for (var i = 0; i < MANIFEST.alerts.length; i++) {
        if (MANIFEST.alerts[i].id === state.settings.alertSound) {
            alertDef = MANIFEST.alerts[i];
            break;
        }
    }
    if (!alertDef) {
        alertDef = MANIFEST.alerts[0];
    }

    var audio = new Audio(alertDef.file);
    audio.volume = Number(state.settings.alertVolume != null ? state.settings.alertVolume : 0.7);
    audio.play().catch(function () {
        // file not added yet - fail silently
    });
}

// A func to record that a focus session was completed today
function logStat() {
    var key = new Date().toISOString().slice(0, 10);
    state.stats[key] = (state.stats[key] || 0) + 1;
    saveState();
    renderStatsIfOpen();
}

// ------------------------------------------- SOUNDSCAPES (ambient, layered, looping) -------------------------------------------
var soundPlayers = {}; // id -> HTMLAudioElement

// A func to get (or create) the audio player for a soundscape
function getSoundPlayer(sound) {
    if (!soundPlayers[sound.id]) {
        var a = new Audio(sound.file);
        a.loop = true;
        a.volume = state.soundVolumes[sound.id] != null ? state.soundVolumes[sound.id] : 0.5;
        soundPlayers[sound.id] = a;
    }
    return soundPlayers[sound.id];
}

// A func to play/pause a soundscape and update its toggle button
function toggleSound(sound, rowEl) {
    var player = getSoundPlayer(sound);
    var toggleBtn = rowEl.querySelector(".sound-toggle");
    if (player.paused) {
        player.play().then(function () {
            toggleBtn.classList.add("is-playing");
        }).catch(function () {
            // no audio file at that path yet
            toggleBtn.classList.add("is-playing");
            setTimeout(function () {
                toggleBtn.classList.remove("is-playing");
            }, 260);
        });
    } else {
        player.pause();
        toggleBtn.classList.remove("is-playing");
    }
}

// ------------------------------------------- PANELS / DRAWER -------------------------------------------
var PANELS = {
    sounds: { title: "Soundscapes", description: "Layer ambient sounds to mask distractions while you focus." },
    themes: { title: "Themes", description: "Pick a backdrop that fits your mood or the time of day." },
    tasks: { title: "Tasks", description: "Jot down what you're working on and check things off as you go." },
    stats: { title: "Stats", description: "Track how many focus sessions you've completed this week." },
    settings: { title: "Settings", description: "Adjust session lengths, cycle length, and the alert sound." }
};
var currentPanel = null;

// A func to open the side drawer to a given panel
function openDrawer(panel) {
    currentPanel = panel;
    el.drawerTitle.textContent = PANELS[panel].title;
    el.drawerSubtitle.textContent = PANELS[panel].description;

    for (var i = 0; i < el.dockBtns.length; i++) {
        var b = el.dockBtns[i];
        b.classList.toggle("is-active", b.dataset.panel === panel);
    }

    renderPanel(panel);
    el.drawer.classList.add("is-open");
    el.drawer.setAttribute("aria-hidden", "false");
    el.drawerOverlay.classList.add("is-open");
}

// A func to close the side drawer
function closeDrawer() {
    el.drawer.classList.remove("is-open");
    el.drawer.setAttribute("aria-hidden", "true");
    el.drawerOverlay.classList.remove("is-open");
    for (var i = 0; i < el.dockBtns.length; i++) {
        el.dockBtns[i].classList.remove("is-active");
    }
    currentPanel = null;
}

// A func to draw whichever panel is currently selected
function renderPanel(panel) {
    el.drawerBody.innerHTML = "";
    if (panel === "sounds") { renderSoundsPanel(); }
    if (panel === "themes") { renderThemeGrid(); }
    if (panel === "tasks") { renderTasksPanel(); }
    if (panel === "stats") { renderStatsPanel(); }
    if (panel === "settings") { renderSettingsPanel(); }
}

// --- sounds ---
// A func to draw the list of ambient soundscapes with volume sliders
function renderSoundsPanel() {
    for (var i = 0; i < MANIFEST.sounds.length; i++) {
        var sound = MANIFEST.sounds[i];
        var row = document.createElement("div");
        row.className = "sound-row";
        row.innerHTML =
            '<button class="sound-toggle" aria-label="Toggle ' + sound.name + '">' +
                '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8">' +
                    '<path d="M5 9v6h4l5 4V5L9 9H5z"></path>' +
                '</svg>' +
            '</button>' +
            '<div class="sound-meta">' +
                '<label>' + sound.name + '</label>' +
                '<input type="range" min="0" max="1" step="0.01" value="' + (state.soundVolumes[sound.id] != null ? state.soundVolumes[sound.id] : 0.5) + '">' +
            '</div>';

        var toggleBtn = row.querySelector(".sound-toggle");
        var range = row.querySelector("input[type=range]");
        var player = soundPlayers[sound.id];
        if (player && !player.paused) {
            toggleBtn.classList.add("is-playing");
        }

        // wrap in a closure so each row keeps its own "sound" and "row"
        (function (sound, row, toggleBtn, range) {
            toggleBtn.addEventListener("click", function () {
                toggleSound(sound, row);
            });
            range.addEventListener("input", function () {
                var v = parseFloat(range.value);
                state.soundVolumes[sound.id] = v;
                getSoundPlayer(sound).volume = v;
                saveState();
            });
        })(sound, row, toggleBtn, range);

        el.drawerBody.appendChild(row);
    }
}

// --- themes ---
// A func to draw the theme picker grid
function renderThemeGrid() {
    if (currentPanel !== "themes") {
        return;
    }
    el.drawerBody.innerHTML = "";
    var grid = document.createElement("div");
    grid.className = "theme-grid";

    for (var i = 0; i < MANIFEST.themes.length; i++) {
        var theme = MANIFEST.themes[i];
        var item = document.createElement("button");
        item.className = "theme-item" + (theme.id === state.theme ? " is-active" : "");
        item.style.backgroundImage = "url(\"" + theme.file + "\")";
        item.innerHTML = "<span>" + theme.name + "</span>";

        (function (theme) {
            item.addEventListener("click", function () {
                applyTheme(theme.id);
            });
        })(theme);

        grid.appendChild(item);
    }
    el.drawerBody.appendChild(grid);
}

// --- tasks ---
// A func to draw the task list panel with an add-task form
function renderTasksPanel() {
    el.drawerBody.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.innerHTML =
        '<form class="task-form">' +
            '<input type="text" placeholder="Add a task…" maxlength="80" autocomplete="off">' +
            '<button type="submit">Add</button>' +
        '</form>' +
        '<ul class="task-list"></ul>';
    el.drawerBody.appendChild(wrap);

    var form = wrap.querySelector("form");
    var input = wrap.querySelector("input");
    var list = wrap.querySelector(".task-list");

    // A func to redraw the task list itself
    function renderList() {
        list.innerHTML = "";
        if (state.tasks.length === 0) {
            var note = document.createElement("p");
            note.className = "empty-note";
            note.textContent = "No tasks yet — add what you're focusing on today.";
            list.replaceWith(note);
            return;
        }
        for (var i = 0; i < state.tasks.length; i++) {
            var task = state.tasks[i];
            var li = document.createElement("li");
            if (task.done) {
                li.classList.add("done");
            }
            li.innerHTML =
                '<input type="checkbox" ' + (task.done ? "checked" : "") + ' aria-label="Mark task done">' +
                '<span></span>' +
                '<button type="button" aria-label="Delete task">&times;</button>';
            li.querySelector("span").textContent = task.text;

            // wrap in a closure so each row keeps its own "i" and "li"
            (function (i, li) {
                li.querySelector("input").addEventListener("change", function (e) {
                    state.tasks[i].done = e.target.checked;
                    saveState();
                    li.classList.toggle("done", e.target.checked);
                });
                li.querySelector("button").addEventListener("click", function () {
                    state.tasks.splice(i, 1);
                    saveState();
                    renderTasksPanel();
                });
            })(i, li);

            list.appendChild(li);
        }
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (!text) {
            return;
        }
        state.tasks.push({ text: text, done: false });
        saveState();
        input.value = "";
        renderTasksPanel();
    });

    renderList();
}

// --- stats ---
// A func to redraw the stats panel only if it's the one currently open
function renderStatsIfOpen() {
    if (currentPanel === "stats") {
        renderStatsPanel();
    }
}

// A func to draw today's session count and a 7-day bar chart
function renderStatsPanel() {
    var todayKey = new Date().toISOString().slice(0, 10);
    var todayCount = state.stats[todayKey] || 0;

    var wrap = document.createElement("div");
    wrap.innerHTML =
        '<div class="stat-today">' +
            '<strong>' + todayCount + '</strong>' +
            '<span>focus session' + (todayCount === 1 ? "" : "s") + ' today</span>' +
        '</div>' +
        '<div class="stat-bars"></div>';
    el.drawerBody.appendChild(wrap);

    var bars = wrap.querySelector(".stat-bars");

    // build the last 7 days, oldest first
    var days = [];
    for (var i = 6; i >= 0; i--) {
        var d = new Date();
        d.setDate(d.getDate() - i);
        var key = d.toISOString().slice(0, 10);
        days.push({
            key: key,
            count: state.stats[key] || 0,
            label: d.toLocaleDateString(undefined, { weekday: "narrow" })
        });
    }

    // find the tallest bar so the rest can be scaled against it
    var max = 1;
    for (var j = 0; j < days.length; j++) {
        if (days[j].count > max) {
            max = days[j].count;
        }
    }

    for (var k = 0; k < days.length; k++) {
        var day = days[k];
        var bar = document.createElement("div");
        bar.className = "stat-bar";
        var heightPct = Math.max(4, (day.count / max) * 100);
        bar.innerHTML =
            '<div class="stat-bar__fill' + (day.count > 0 ? " has-count" : "") + '" style="height:' + heightPct + '%"></div>' +
            '<div class="stat-bar__label">' + day.label + '</div>';
        bars.appendChild(bar);
    }
}

// --- settings ---
// A func to draw the settings panel (session lengths, alert sound + volume)
function renderSettingsPanel() {
    var alertOptionsHtml = "";
    for (var i = 0; i < MANIFEST.alerts.length; i++) {
        var a = MANIFEST.alerts[i];
        var selected = a.id === state.settings.alertSound ? "selected" : "";
        alertOptionsHtml += '<option value="' + a.id + '" ' + selected + '>' + a.name + '</option>';
    }

    var wrap = document.createElement("div");
    wrap.innerHTML =
        '<div class="field-row">' +
            '<label for="setFocus">Focus length (min)</label>' +
            '<input type="number" id="setFocus" min="1" max="120" value="' + state.settings.focus + '">' +
        '</div>' +
        '<div class="field-row">' +
            '<label for="setShort">Short break (min)</label>' +
            '<input type="number" id="setShort" min="1" max="60" value="' + state.settings.short + '">' +
        '</div>' +
        '<div class="field-row">' +
            '<label for="setLong">Long break (min)</label>' +
            '<input type="number" id="setLong" min="1" max="90" value="' + state.settings.long + '">' +
        '</div>' +
        '<div class="field-row">' +
            '<label for="setCycle">Sessions before long break</label>' +
            '<input type="number" id="setCycle" min="2" max="8" value="' + state.settings.sessionsBeforeLong + '">' +
        '</div>' +
        '<div class="field-row">' +
            '<label for="setAlert">Alert sound</label>' +
            '<div class="alert-select-group">' +
                '<select id="setAlert">' + alertOptionsHtml + '</select>' +
                '<button type="button" class="icon-btn" id="previewAlertBtn" aria-label="Play alert sound">' +
                    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 4l14 8-14 8V4z"></path></svg>' +
                '</button>' +
            '</div>' +
        '</div>' +
        '<div class="field-row">' +
            '<label for="setAlertVolume">Alert volume</label>' +
            '<div class="alert-volume-group">' +
                '<input type="range" id="setAlertVolume" min="0" max="1" step="0.01" value="' + Number(state.settings.alertVolume != null ? state.settings.alertVolume : 0.7) + '">' +
                '<span>' + Math.round(Number(state.settings.alertVolume != null ? state.settings.alertVolume : 0.7) * 100) + '%</span>' +
            '</div>' +
        '</div>' +
        '<p class="settings-hint">' +
            'Drop your own photos into <code>/images</code> and sounds into <code>/audio</code>, ' +
            'then match the filenames in the <code>MANIFEST</code> at the top of <code>script.js</code>.' +
        '</p>';
    el.drawerBody.appendChild(wrap);

    // A func to wire up a settings field so it saves on change
    function bind(id, key, parse, onChange) {
        wrap.querySelector(id).addEventListener("change", function (e) {
            state.settings[key] = parse ? parse(e.target.value) : e.target.value;
            saveState();
            var modeKey = modeKeyFor(key);
            if (!timer.running && key !== "sessionsBeforeLong" && key !== "alertSound" && timer.mode === modeKey) {
                resetTimer();
            }
            renderDots();
            if (onChange) {
                onChange();
            }
        });
    }

    // A func to map a settings key back to its matching timer mode
    function modeKeyFor(settingKey) {
        var lookup = { focus: "focus", short: "short", long: "long" };
        return lookup[settingKey];
    }

    bind("#setFocus", "focus", Number);
    bind("#setShort", "short", Number);
    bind("#setLong", "long", Number);
    bind("#setCycle", "sessionsBeforeLong", Number);
    // Selecting a different alert sound previews it once immediately.
    bind("#setAlert", "alertSound", null, function () {
        playAlert();
    });

    var alertVolumeInput = wrap.querySelector("#setAlertVolume");
    var alertVolumeLabel = alertVolumeInput.parentElement.querySelector("span");
    alertVolumeInput.addEventListener("input", function (e) {
        var value = Number(e.target.value);
        state.settings.alertVolume = value;
        alertVolumeLabel.textContent = Math.round(value * 100) + "%";
        saveState();
    });

    var previewBtn = wrap.querySelector("#previewAlertBtn");
    var previewLockTimeout = null;

    // A func to swap the preview button's icon between play/playing states
    function setPreviewButtonState(isPreviewing) {
        previewBtn.classList.toggle("is-previewing", isPreviewing);
        previewBtn.disabled = isPreviewing;
        previewBtn.setAttribute("aria-label", isPreviewing ? "Alert sound previewing" : "Play alert sound");
        if (isPreviewing) {
            previewBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 5h3v14H7zm7 0h3v14h-3z"></path></svg>';
        } else {
            previewBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 4l14 8-14 8V4z"></path></svg>';
        }
    }

    previewBtn.addEventListener("click", function () {
        if (previewBtn.disabled) {
            return;
        }
        setPreviewButtonState(true);
        playAlert();
        if (previewLockTimeout) {
            clearTimeout(previewLockTimeout);
        }
        previewLockTimeout = setTimeout(function () {
            setPreviewButtonState(false);
        }, 3500);
    });
}

// ------------------------------------------- WIRING -------------------------------------------
for (var wi = 0; wi < el.modes.length; wi++) {
    (function (btn) {
        btn.addEventListener("click", function () {
            stopRunning();
            setMode(btn.dataset.mode);
        });
    })(el.modes[wi]);
}

el.startBtn.addEventListener("click", toggleRunning);
el.resetBtn.addEventListener("click", resetTimer);

for (var di = 0; di < el.dockBtns.length; di++) {
    (function (btn) {
        btn.addEventListener("click", function () {
            if (currentPanel === btn.dataset.panel) {
                closeDrawer();
                return;
            }
            openDrawer(btn.dataset.panel);
        });
    })(el.dockBtns[di]);
}

el.settingsBtn.addEventListener("click", function () {
    if (currentPanel === "settings") {
        closeDrawer();
        return;
    }
    openDrawer("settings");
});
el.drawerClose.addEventListener("click", closeDrawer);
el.drawerOverlay.addEventListener("click", closeDrawer);
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        closeDrawer();
    }
});

// ------------------------------------------- INIT -------------------------------------------
setMode(timer.mode, { resetTime: true });
applyTheme(state.theme, { instant: true });
renderTime();
renderDots();
