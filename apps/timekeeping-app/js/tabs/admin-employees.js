// js/tabs/admin-employees.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

// All queries in this file will target schema "te_app"
const db = client.schema("te_app");

export const template = /*html*/ `
  <article>
    <h3>Admin – Employees</h3>

    <section style="margin-bottom:1rem;">
      <h4 style="margin-bottom:0.4rem;">Create / Edit Employee</h4>

      <form id="empForm" class="grid" style="
        max-width: 1000px;
        gap: 0.5rem;
        grid-template-columns: 1.6fr 1.2fr 1.2fr 1.6fr 1.2fr 0.9fr 0.9fr;
      ">
        <input type="hidden" id="empId">

        <label>
          Email
          <input id="empEmail" type="email" placeholder="name@company.com">
        </label>

        <label>
          First name
          <input id="empFirst" type="text">
        </label>

        <label>
          Last name
          <input id="empLast" type="text">
        </label>

        <label>
          Manager
          <select id="empManager">
            <option value="">— None —</option>
          </select>
        </label>

        <label>
          Role
          <select id="empRole">
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <label>
          Active
          <select id="empActive">
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>

        <div style="display:flex;align-items:center;gap:0.25rem;margin-top:1.2rem;">
          <button id="empSave" type="button" class="btn-sm">Save</button>
          <button id="empNew" type="button" class="btn-sm secondary">New</button>
        </div>
      </form>

      <small id="empMsg"></small>
    </section>

    <section>
      <h4 style="margin-bottom:0.4rem;">All Employees</h4>
      <div class="scroll-x">
        <table class="data-grid compact-grid" id="empTable">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Manager</th>
              <th>Role</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </section>
  </article>
`;

let rootEl = null;
let employees = [];
let isSaving = false;

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $("#empMsg", rootEl);
  if (!el) return;

  el.textContent = text || "";
  el.style.color = isErr ? "#b00" : "inherit";

  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 4000);
  }
}

function setSavingUI(saving) {
  isSaving = saving;
  const btn = $("#empSave", rootEl);
  if (btn) btn.disabled = saving;
}

export async function init(root) {
  rootEl = root;
  root.innerHTML = template;

  $("#empSave", root).addEventListener("click", saveEmployee);
  $("#empNew", root).addEventListener("click", () => fillForm(null));

  await loadEmployees();
}

async function loadEmployees() {
  msg("Loading…");

  const { data, error } = await db
    .from("employees")
    .select("id,email,first_name,last_name,manager_id,is_admin,is_active")
    .order("first_name", { ascending: true });

  if (error) {
    console.error("[employees] load error", error);
    msg(error.message, true);
    return;
  }

  employees = data || [];
  populateManagerSelect();
  renderEmployeesTable();
  fillForm(null);
  msg("");
}

function populateManagerSelect() {
  const sel = $("#empManager", rootEl);
  sel.innerHTML = '<option value="">— None —</option>';

  employees.forEach((e) => {
    const label =
      `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.email || "";
    const opt = new Option(label, e.id);
    sel.appendChild(opt);
  });
}

function renderEmployeesTable() {
  const tb = $("#empTable tbody", rootEl);
  tb.innerHTML = "";

  employees.forEach((e) => {
    const mgr = employees.find((m) => m.id === e.manager_id);
    const tr = h("<tr></tr>");

    const name = `${e.first_name || ""} ${e.last_name || ""}`.trim();
    const mgrName = mgr
      ? `${mgr.first_name || ""} ${mgr.last_name || ""}`.trim()
      : "";

    tr.innerHTML = `
      <td>${e.email || ""}</td>
      <td>${name}</td>
      <td>${mgrName}</td>
      <td>${e.is_admin ? "Admin" : "Employee"}</td>
      <td>${e.is_active ? "Yes" : "No"}</td>
      <td>
        <button type="button" class="btn-sm secondary" data-id="${e.id}">Edit</button>
      </td>
    `;

    tb.appendChild(tr);
  });

  tb.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const row = employees.find((e) => e.id === id);
      fillForm(row || null);
    });
  });
}

function fillForm(e) {
  $("#empId", rootEl).value = e?.id || "";
  $("#empEmail", rootEl).value = e?.email || "";
  $("#empFirst", rootEl).value = e?.first_name || "";
  $("#empLast", rootEl).value = e?.last_name || "";
  $("#empManager", rootEl).value = e?.manager_id || "";
  $("#empRole", rootEl).value = e?.is_admin ? "admin" : "employee";
  $("#empActive", rootEl).value = e?.is_active === false ? "false" : "true";
}

async function saveEmployee() {
  if (isSaving) return;

  const id = $("#empId", rootEl).value || null;
  const email = $("#empEmail", rootEl).value.trim().toLowerCase();
  const first_name = $("#empFirst", rootEl).value.trim();
  const last_name = $("#empLast", rootEl).value.trim();
  const manager_id = $("#empManager", rootEl).value || null;
  const roleValue = $("#empRole", rootEl).value;
  const activeValue = $("#empActive", rootEl).value;

  if (!email || !first_name || !last_name) {
    msg("Email, first and last name are required.", true);
    return;
  }

  const row = {
    email,
    first_name,
    last_name,
    manager_id,
    is_admin: roleValue === "admin",
    is_active: activeValue === "true",
  };

  try {
    setSavingUI(true);
    msg("Saving…");

    let res;
    if (id) {
      // For updates, do NOT use .single() (could return 0 rows in some cases)
      res = await db.from("employees").update(row).eq("id", id).select();
    } else {
      // For inserts, getting back the inserted row is useful
      res = await db.from("employees").insert(row).select().single();
    }

    if (res.error) throw res.error;

    msg("Saved.");
    await loadEmployees();
  } catch (e) {
    console.error("[employees] save error", e);
    msg(e?.message || String(e), true);
  } finally {
    setSavingUI(false);
  }
}

export const adminEmployeesTab = { template, init };
