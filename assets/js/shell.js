// Injects the top bar + collapsible sidebar into #appShell.
// Each page sets window.FOY_PAGE = { active: 'congregations', quickAdd: [...], searchTarget: 'congregationSearch' }
// before this script runs.

(function () {
  var SPRITE =
    '<svg class="shell-visually-hidden" aria-hidden="true"><defs>' +
    '<symbol id="si-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>' +
    '<symbol id="si-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3a2 2 0 110-4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.6V3a2 2 0 114 0v.2a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.2a1.7 1.7 0 00-1.5 1z"/></symbol>' +
    '<symbol id="si-chevron-left" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></symbol>' +
    '<symbol id="si-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></symbol>' +
    '<symbol id="si-map-pin" viewBox="0 0 24 24"><path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></symbol>' +
    '<symbol id="si-church" viewBox="0 0 24 24"><path d="M12 3v3M9 6h6M4 21h16M6 21V11l6-4 6 4v10M10 21v-6h4v6"/></symbol>' +
    '<symbol id="si-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2A5 5 0 0121 19"/></symbol>' +
    '<symbol id="si-file-text" viewBox="0 0 24 24"><path d="M6 3h9l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M9 12h6M9 16h6M9 8h3"/></symbol>' +
    '<symbol id="si-refresh" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0115-6.7M21 12a9 9 0 01-15 6.7"/><path d="M3 3v6h6M21 21v-6h-6"/></symbol>' +
    '<symbol id="si-moon" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z"/></symbol>' +
    '</defs></svg>';

  var THEME_KEY = "foyTheme";

  function getTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    } catch (e) {
      return "light";
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-bs-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }

  function themeToggleHtml(current) {
    return (
      '<button type="button" class="dropdown-item shell-theme-toggle" id="shellThemeToggle">' +
      icon("si-moon") +
      "<span>Dark mode</span>" +
      '<span class="form-check form-switch m-0 ms-auto"><input class="form-check-input" type="checkbox" role="switch" id="shellThemeSwitch"' +
      (current === "dark" ? " checked" : "") +
      " tabindex=\"-1\"></span>" +
      "</button>"
    );
  }

  var NAV = [
    { key: "overview", label: "Overview", href: "dashboard.html", icon: "si-grid" }
  ];

  var DIRECTORY = [
    { key: "presbyteries", label: "Presbyteries", href: "presbytery.html", icon: "si-map-pin" },
    { key: "congregations", label: "Congregations", href: "congregations.html", icon: "si-church" },
    { key: "members", label: "Members", href: "members.html", icon: "si-users" },
    { key: "reports", label: "Reports", href: "#", icon: "si-file-text" }
  ];

  var PAGE_LABELS = {
    overview: "Overview",
    presbyteries: "Presbyteries",
    congregations: "Congregations",
    members: "Members",
    reports: "Reports"
  };

  function icon(name) {
    return '<svg class="shell-icon"><use href="#' + name + '"/></svg>';
  }

  function navLink(item, active, extraClass) {
    var cls = "shell-nav-link" + (item.key === active ? " active" : "") + (extraClass ? " " + extraClass : "");
    var current = item.key === active ? ' aria-current="page"' : "";
    return '<a class="' + cls + '" href="' + item.href + '"' + current + ">" + icon(item.icon) + "<span>" + item.label + "</span></a>";
  }

  // The structure a user's account is connected to (set at login by
  // completeLogin() in auth.js, from the Directory's structure list).
  function getAssignedStructureName() {
    try {
      var cu = JSON.parse(localStorage.getItem("currentUser") || "{}");
      if (cu && cu.structure && cu.structure.name) return cu.structure.name;
    } catch (e) {}
    return "FOY Membership";
  }

  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem("currentUser") || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  // Two-letter initials from the user's name ("Sarah Jacobs" -> "SJ"), falling
  // back to the first two letters of their email's local part if no name is set.
  function getUserInitials(user) {
    var name = (user && user.name ? user.name : "").trim();
    if (name) {
      var parts = name.split(/\s+/).filter(Boolean);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    var email = (user && user.email ? user.email : "").trim();
    if (email) return email.split("@")[0].slice(0, 2).toUpperCase();
    return "?";
  }

  function buildBreadcrumb(pageLabel) {
    var parts = [];
    try {
      var cu = JSON.parse(localStorage.getItem("currentUser") || "{}");
      if (cu && cu.activePresbytery && cu.activePresbytery.name) {
        parts.push({ label: cu.activePresbytery.name });
      }
    } catch (e) {}
    parts.push({ label: pageLabel, current: true });
    return parts
      .map(function (p, i) {
        var sep = i > 0 ? '<span class="shell-crumb-sep">/</span>' : "";
        return sep + '<span class="' + (p.current ? "current" : "") + '">' + p.label + "</span>";
      })
      .join("");
  }

  function quickAddHtml(items) {
    if (!items || !items.length) {
      return '<li><span class="dropdown-item text-muted small">Nothing to add here</span></li>';
    }
    return items
      .map(function (i) {
        var cls = "dropdown-item" + (i.adminOnly ? " admin-only d-none" : "");
        var idAttr = i.id ? ' id="' + i.id + '"' : "";
        return (
          '<li><a class="' + cls + '"' + idAttr + ' href="#" data-bs-toggle="modal" data-bs-target="' +
          i.target +
          '">' +
          i.label +
          "</a></li>"
        );
      })
      .join("");
  }

  function init() {
    var cfg = window.FOY_PAGE || {};
    var mount = document.getElementById("appShell");
    if (!mount) return;

    document.body.classList.add("has-shell");
    try {
      if (localStorage.getItem("foyShellCollapsed") === "1") {
        document.body.classList.add("shell-collapsed");
      }
    } catch (e) {}

    applyTheme(getTheme());

    var breadcrumb = buildBreadcrumb(PAGE_LABELS[cfg.active] || "FOY Membership");
    var assignedStructureName = getAssignedStructureName();
    var currentUser = getCurrentUser();
    var userInitials = getUserInitials(currentUser);
    var userDisplayName = currentUser.name || currentUser.email || "";
    var navHtml = NAV.map(function (item) {
      return navLink(item, cfg.active);
    }).join("");
    var directoryHtml = DIRECTORY.map(function (item) {
      return navLink(item, cfg.active);
    }).join("");
    var currentTheme = getTheme();

    mount.innerHTML =
      SPRITE +
      '<div class="shell-topbar">' +
        '<div class="shell-topbar-left">' +
          '<a class="shell-brand" href="dashboard.html"><span class="shell-brand-mark"><img src="img/upfoy-logo.png" alt="FOY"></span><span class="shell-brand-name">FOY Membership</span></a>' +
          '<span class="shell-crumb-sep">/</span>' +
          '<nav class="shell-crumbs" aria-label="Breadcrumb">' + breadcrumb + "</nav>" +
        "</div>" +
        '<div class="shell-topbar-right">' +
          '<div class="dropdown">' +
            '<button class="shell-icon-btn" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Quick add">' + icon("si-plus") + "</button>" +
            '<ul class="dropdown-menu dropdown-menu-end">' + quickAddHtml(cfg.quickAdd) + "</ul>" +
          "</div>" +
          '<div class="dropdown">' +
            '<button class="shell-icon-btn" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Settings">' + icon("si-gear") + "</button>" +
            '<ul class="dropdown-menu dropdown-menu-end">' +
              '<li><a class="dropdown-item" href="#" onclick="exportDatabase()">Export data</a></li>' +
              '<li><a class="dropdown-item" id="syncSheetBtn" href="#" onclick="manualSyncFromSheet()" title="Sync latest data from Google Sheet">Sync from Google Sheet</a></li>' +
              '<li><hr class="dropdown-divider"></li>' +
              '<li>' + themeToggleHtml(currentTheme) + "</li>" +
            "</ul>" +
          "</div>" +
          '<div class="dropdown">' +
            '<button class="shell-avatar" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Account">' + userInitials + "</button>" +
            '<ul class="dropdown-menu dropdown-menu-end">' +
              '<li><div class="shell-dropdown-user" id="userWelcome">' + userDisplayName + "</div></li>" +
              '<li><a class="dropdown-item" href="#" onclick="logout()">Logout</a></li>' +
            "</ul>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<aside class="shell-sidebar" aria-label="Main navigation">' +
        '<div class="shell-switcher">' +
          '<span class="shell-switcher-mark"><img src="img/upfoy-logo.png" alt="FOY"></span>' +
          '<span class="shell-switcher-text"><span class="shell-switcher-label">Organisation</span><span class="shell-switcher-name">' + assignedStructureName + '</span></span>' +
        "</div>" +
        '<div class="shell-nav-group">' + navHtml + "</div>" +
        '<div class="shell-nav-group">' +
          '<div class="shell-nav-eyebrow">Records</div>' +
          '<div class="shell-nav-sub">' + directoryHtml + "</div>" +
        "</div>" +
        '<div class="shell-sidebar-spacer"></div>' +
        '<div class="shell-sidebar-footer">' +
          '<a class="shell-nav-link" href="#">' + icon("si-gear") + "<span>Project settings</span></a>" +
          '<button class="shell-collapse-btn" id="shellCollapseBtn" aria-label="Collapse sidebar" title="Collapse sidebar">' + icon("si-chevron-left") + "</button>" +
        "</div>" +
      "</aside>";

    var collapseBtn = document.getElementById("shellCollapseBtn");
    collapseBtn.addEventListener("click", function () {
      var collapsed = document.body.classList.toggle("shell-collapsed");
      try {
        localStorage.setItem("foyShellCollapsed", collapsed ? "1" : "0");
      } catch (e) {}
    });

    var themeToggleBtn = document.getElementById("shellThemeToggle");
    var themeSwitch = document.getElementById("shellThemeSwitch");
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", function () {
        var next = getTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        if (themeSwitch) themeSwitch.checked = next === "dark";
      });
    }
  }

  // Progressively enhances select[data-dd-enhance] elements (page filter/sort
  // controls) into the mockup's dropdown-styled "title" look, while keeping the
  // real <select> as the source of truth so existing page scripts (which read
  // .value and listen for "change") keep working untouched.
  function enhanceDropdownSelects() {
    Array.prototype.forEach.call(document.querySelectorAll("select[data-dd-enhance]"), function (select) {
      if (select.dataset.ddEnhanced) return;
      select.dataset.ddEnhanced = "1";
      select.style.display = "none";

      var wrap = document.createElement("div");
      wrap.className = "dropdown dd-select-wrap";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dd-select-btn";
      btn.setAttribute("data-bs-toggle", "dropdown");
      btn.setAttribute("aria-expanded", "false");

      var labelSpan = document.createElement("span");
      labelSpan.className = "dd-select-label";
      btn.appendChild(labelSpan);
      var chev = document.createElement("i");
      chev.className = "bi bi-chevron-down dd-select-chev";
      chev.setAttribute("aria-hidden", "true");
      btn.appendChild(chev);

      var menu = document.createElement("ul");
      menu.className = "dropdown-menu";

      wrap.appendChild(btn);
      wrap.appendChild(menu);
      select.insertAdjacentElement("afterend", wrap);

      function syncLabel() {
        var opt = select.options[select.selectedIndex];
        labelSpan.textContent = opt ? opt.textContent : "";
      }
      function rebuildMenu() {
        menu.innerHTML = "";
        Array.prototype.forEach.call(select.options, function (opt) {
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.href = "#";
          a.className = "dropdown-item" + (opt.selected ? " active" : "");
          a.textContent = opt.textContent;
          a.addEventListener("click", function (e) {
            e.preventDefault();
            select.value = opt.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            syncLabel();
          });
          li.appendChild(a);
          menu.appendChild(li);
        });
      }
      wrap.addEventListener("show.bs.dropdown", rebuildMenu);
      syncLabel();
    });

    // Some pages reset a select's .value programmatically (e.g. a "clear
    // filters" button) without dispatching "change" — keep the visible label
    // honest by re-syncing it after any click on the page.
    if (!document.body.dataset.ddLabelSyncBound) {
      document.body.dataset.ddLabelSyncBound = "1";
      document.addEventListener("click", function () {
        requestAnimationFrame(function () {
          Array.prototype.forEach.call(document.querySelectorAll("select[data-dd-enhance]"), function (select) {
            var wrap = select.nextElementSibling;
            if (!wrap || !wrap.classList.contains("dd-select-wrap")) return;
            var label = wrap.querySelector(".dd-select-label");
            var opt = select.options[select.selectedIndex];
            if (label && opt) label.textContent = opt.textContent;
          });
        });
      });
    }
  }

  init();
  document.addEventListener("DOMContentLoaded", enhanceDropdownSelects);
})();
