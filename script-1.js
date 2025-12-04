/* ============================================================
   KONFIGURASI GLOBAL
   ============================================================ */

// Jika API kamu berada di domain yang sama (Cloudflare Pages + Functions),
// cukup kosongkan string berikut:
const API_BASE = "";

// Lama ujian (menit)
const EXAM_DURATION_MINUTES = 60;

// LocalStorage Keys
const LS_KEYS = {
  student: "exam_student_info",
  endTime: "exam_end_time",
  answers: "exam_answers"
};

// Cache global
let STUDENT_LIST = [];
let questions = [];
let answers = [];
let currentIndex = 0;
let timerInterval = null;
let timeOver = false;

/* ============================================================
   API HELPER — versi debug (mendeteksi jika API mengembalikan HTML)
   ============================================================ */

async function apiGet(path) {
  try {
    const res = await fetch(API_BASE + path);

    const ct = res.headers.get("content-type") || "";
    console.debug(`[apiGet] ${path} status=${res.status} ct=${ct}`);

    if (!res.ok) {
      const text = await res.text();
      console.error(`[apiGet] ERROR ${path}`, text.slice(0, 300));
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    if (!ct.includes("application/json")) {
      const text = await res.text();
      console.warn(`[apiGet] NON-JSON (${ct}) preview:`, text.slice(0, 300));
      throw new Error(`Non-JSON response (${ct})`);
    }

    return await res.json();
  } catch (err) {
    console.error("[apiGet] catch:", err);
    throw err;
  }
}

async function apiPost(path, data) {
  try {
    const res = await fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const ct = res.headers.get("content-type") || "";
    console.debug(`[apiPost] ${path} status=${res.status} ct=${ct}`);

    if (!res.ok) {
      const text = await res.text();
      console.error(`[apiPost] ERROR ${path}`, text.slice(0, 300));
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    return await res.json();
  } catch (err) {
    console.error("[apiPost] catch:", err);
    throw err;
  }
}

/* ============================================================
   DETEKSI HALAMAN
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;

  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  if (page === "index") initIndexPage();
  if (page === "ujian") initExamPage();
});


/* ============================================================
   INDEX PAGE — load siswa & mapel
   ============================================================ */

function initIndexPage() {
  loadSiswaForIndex();
  loadSubjectsForIndex();

  const form = document.getElementById("student-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const siswaSelect = document.getElementById("siswa");
    const mapelSelect = document.getElementById("mapel");

    const siswaId = siswaSelect.value;
    const mapelId = mapelSelect.value;

    if (!siswaId) return alert("Silakan pilih nama siswa.");
    if (!mapelId) return alert("Silakan pilih mata pelajaran.");

    const row = STUDENT_LIST.find(s => String(s.id) === siswaId);
    if (!row) return alert("Data siswa tidak ditemukan!");

    try {
      const mulai = await apiPost("/api/mulai-ujian", {
        siswa_id: Number(siswaId),
        mapel_id: Number(mapelId)
      });

      const mapelNama =
        mapelSelect.options[mapelSelect.selectedIndex]?.textContent || "";

      const studentData = {
        ujian_siswa_id: mulai.ujian_siswa_id,
        siswa_id: Number(siswaId),
        mapel_id: Number(mapelId),
        mapelNama,
        no_absen: row.no_absen || row._absen || "",
        nama: row.nama || "",
        kelas: row.kelas || "",
        nis: row.nis || "",
        nisn: row.nisn || "",
        jk: row.jk || ""
      };

      localStorage.setItem(LS_KEYS.student, JSON.stringify(studentData));
      localStorage.removeItem(LS_KEYS.endTime);
      localStorage.removeItem(LS_KEYS.answers);

      window.location.href = "ujian.html";
    } catch (err) {
      console.error(err);
      alert("Gagal memulai ujian. Periksa API.");
    }
  });
}
/* ============================================================
   LOAD DATA SISWA
   ============================================================ */

async function loadSiswaForIndex() {
  const select = document.getElementById("siswa");
  const info = document.getElementById("siswa-info");

  select.disabled = true;
  select.innerHTML = `<option>Memuat daftar siswa...</option>`;

  try {
    const rows = await apiGet("/api/siswa");
    console.log("API siswa:", rows);

    STUDENT_LIST = rows.slice();

    // urutkan berdasarkan kelas, lalu absen/nama
    STUDENT_LIST.sort((a, b) => {
      const ka = String(a.kelas || "");
      const kb = String(b.kelas || "");
      if (ka < kb) return -1;
      if (ka > kb) return 1;

      const na = String(a.no_absen || a._absen || 0);
      const nb = String(b.no_absen || b._absen || 0);
      return Number(na) - Number(nb);
    });

    select.innerHTML = "";

    // placeholder
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "Pilih nama siswa...";
    ph.disabled = true;
    ph.selected = true;
    select.appendChild(ph);

    STUDENT_LIST.forEach((s, i) => {
      const opt = document.createElement("option");
      const absen = s.no_absen || s._absen || (i + 1);
      s._absen = absen;

      opt.value = String(s.id);
      opt.textContent = `${String(absen).padStart(2, "0")} - ${s.nama} (Kelas ${s.kelas})`;

      select.appendChild(opt);
    });

    select.disabled = false;
    if (info) info.textContent = "Pilih namamu sesuai daftar hadir.";
  } catch (err) {
    console.error("Gagal memuat siswa:", err);
    select.innerHTML = `<option>Gagal memuat data siswa.</option>`;
  }

  // update ringkasan
  select.addEventListener("change", () => {
    const row = STUDENT_LIST.find(s => String(s.id) === select.value);
    updateStudentSummary(row);
  });
}

function updateStudentSummary(row) {
  const ph = document.getElementById("student-summary-placeholder");
  const box = document.getElementById("student-summary-content");

  if (!row) {
    ph.classList.remove("hidden");
    box.classList.add("hidden");
    return;
  }

  ph.classList.add("hidden");
  box.classList.remove("hidden");

  document.getElementById("sum-nama").textContent = row.nama;
  document.getElementById("sum-absen").textContent = row._absen;
  document.getElementById("sum-kelas").textContent = row.kelas;
  document.getElementById("sum-nis").textContent = row.nis;
  document.getElementById("sum-nisn").textContent = row.nisn;
  document.getElementById("sum-jk").textContent = row.jk;
}

/* ============================================================
   LOAD DATA MAPEL
   ============================================================ */

async function loadSubjectsForIndex() {
  const select = document.getElementById("mapel");
  const info = document.getElementById("mapel-info");

  select.disabled = true;
  select.innerHTML = `<option>Memuat daftar mata pelajaran...</option>`;

  try {
    const rows = await apiGet("/api/mapel");
    console.log("API mapel:", rows);

    select.innerHTML = "";

    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "Pilih mata pelajaran...";
    ph.disabled = true;
    ph.selected = true;
    select.appendChild(ph);

    rows.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = String(m.id);
      opt.textContent = m.nama;
      select.appendChild(opt);
    });

    select.disabled = false;
    if (info) info.textContent = "Pilih mata pelajaran.";
  } catch (err) {
    console.error("Gagal memuat mapel:", err);
    select.innerHTML = `<option>Gagal memuat mata pelajaran.</option>`;
  }
}

/* ============================================================
   HALAMAN UJIAN — SETUP
   ============================================================ */

function initExamPage() {
  const stored = localStorage.getItem(LS_KEYS.student);
  if (!stored) {
    alert("Data siswa tidak ditemukan. Mulai ulang.");
    return (window.location.href = "index.html");
  }

  const student = JSON.parse(stored);

  const infoEl = document.getElementById("student-info");
  infoEl.textContent =
    `${student.nama} | Absen ${student.no_absen || student._absen} | ` +
    `Kelas ${student.kelas} | Mapel ${student.mapelNama}`;

  setupTimer();
  loadQuestions(student.mapel_id);
}

async function loadQuestions(mapelId) {
  const loadingEl = document.getElementById("loading-questions");
  const examContentEl = document.getElementById("exam-content");

  loadingEl.textContent = "Memuat soal dari database...";

  try {
    const rows = await apiGet(`/api/soal?mapel_id=${encodeURIComponent(mapelId)}`);
    console.log("API soal:", rows);

    questions = rows.map((r) => ({
      id: r.id,
      nomor: r.nomor,
      text: r.teks || "",
      options: [r.a || "", r.b || "", r.c || "", r.d || ""],
      stimulus: r.stimulus || "",
      stimulusImageUrl: r.stimulus_url_gambar || ""
    }));

    answers = new Array(questions.length).fill(null);

    const student = JSON.parse(localStorage.getItem(LS_KEYS.student));
    restoreAnswersFromStorage(String(student.mapel_id));

    loadingEl.classList.add("hidden");
    examContentEl.classList.remove("hidden");

    buildQuestionGrid();
    showQuestion();
    updateProgress();
  } catch (err) {
    console.error("Gagal load soal:", err);
    loadingEl.textContent = "Gagal memuat soal.";
  }
}
/* ============================================================
   TAMPILKAN SOAL + STIMULUS + LATEX
   ============================================================ */

function showQuestion() {
  if (!questions.length) return;

  const q = questions[currentIndex];

  const numEl = document.getElementById("question-number");
  const textEl = document.getElementById("question-text");
  const optionsEl = document.getElementById("options-container");

  // --- Stimulus elements ---
  const stimulusEl = document.getElementById("stimulus");
  const stimulusTextEl = document.getElementById("stimulus-text");
  const stimulusImgWrap = document.getElementById("stimulus-img-wrap");
  const stimulusImg = document.getElementById("stimulus-image");

  /* ============================
     STIMULUS (teks + gambar)
     ============================ */
  if (q.stimulus || q.stimulusImageUrl) {
    // tampilkan teks stimulus
    if (q.stimulus) {
      stimulusTextEl.textContent = q.stimulus;
      stimulusTextEl.classList.remove("hidden");
    } else {
      stimulusTextEl.textContent = "";
      stimulusTextEl.classList.add("hidden");
    }

    // tampilkan gambar stimulus
    if (q.stimulusImageUrl) {
      stimulusImg.src = q.stimulusImageUrl;
      stimulusImg.alt = "Gambar stimulus";
      stimulusImgWrap.classList.remove("hidden");
    } else {
      stimulusImg.src = "";
      stimulusImgWrap.classList.add("hidden");
    }

    stimulusEl.classList.remove("hidden");
  } else {
    // tidak ada stimulus
    stimulusTextEl.textContent = "";
    stimulusImg.src = "";
    stimulusImgWrap.classList.add("hidden");
    stimulusEl.classList.add("hidden");
  }

  /* ============================
     TAMPILKAN TEKS SOAL
     ============================ */
  if (numEl) numEl.textContent = `Soal ${currentIndex + 1}`;
  if (textEl) textEl.textContent = q.text;

  /* ============================
     OPSI PILIHAN GANDA
     ============================ */
  optionsEl.innerHTML = "";
  const letters = ["A", "B", "C", "D"];
  const currentAnswer = answers[currentIndex];

  letters.forEach((letter, idx) => {
    const optText = q.options[idx];
    if (!optText) return;

    const label = document.createElement("label");
    label.className = "option-item";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "opsi";
    input.value = letter;
    input.checked = currentAnswer === letter;
    input.disabled = timeOver;

    input.addEventListener("change", () => {
      if (timeOver) return;
      answers[currentIndex] = letter;
      updateProgress();
      updateGrid();

      const student = JSON.parse(localStorage.getItem(LS_KEYS.student));
      saveAnswersToStorage(String(student.mapel_id));
    });

    const letterSpan = document.createElement("span");
    letterSpan.className = "option-label-letter";
    letterSpan.textContent = `${letter}.`;

    const textSpan = document.createElement("span");
    textSpan.textContent = optText;

    label.appendChild(input);
    label.appendChild(letterSpan);
    label.appendChild(textSpan);

    optionsEl.appendChild(label);
  });

  // tombol navigasi
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  if (prevBtn) prevBtn.disabled = timeOver || currentIndex === 0;
  if (nextBtn) nextBtn.disabled = timeOver || currentIndex === questions.length - 1;

  updateGrid();

  /* ============================
     RENDER LATEX (MathJax)
     ============================ */
  if (window.MathJax && window.MathJax.typesetPromise) {
    MathJax.typesetPromise([textEl, optionsEl, stimulusEl]).catch(err =>
      console.error("MathJax error:", err)
    );
  }
}

/* ============================================================
   AUTOSAVE JAWABAN
   ============================================================ */

function saveAnswersToStorage(mapelKey) {
  try {
    const payload = {
      mapelKey: String(mapelKey),
      currentIndex,
      answers,
      savedAt: Date.now()
    };
    localStorage.setItem(LS_KEYS.answers, JSON.stringify(payload));
  } catch (e) {
    console.warn("Gagal autosave:", e);
  }
}

function restoreAnswersFromStorage(mapelKey) {
  try {
    const raw = localStorage.getItem(LS_KEYS.answers);
    if (!raw) return;

    const data = JSON.parse(raw);

    if (
      data.mapelKey === String(mapelKey) &&
      Array.isArray(data.answers) &&
      data.answers.length === questions.length
    ) {
      answers = data.answers;
      currentIndex = Math.min(
        Math.max(data.currentIndex || 0, 0),
        questions.length - 1
      );
    }
  } catch (e) {
    console.warn("Gagal restore autosave:", e);
  }
}

/* ============================================================
   GRID NOMOR SOAL
   ============================================================ */

function buildQuestionGrid() {
  const grid = document.getElementById("question-grid");

  grid.innerHTML = "";

  for (let i = 0; i < questions.length; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = i + 1;
    btn.disabled = timeOver;

    btn.addEventListener("click", () => {
      if (timeOver) return;
      currentIndex = i;

      const student = JSON.parse(localStorage.getItem(LS_KEYS.student));
      saveAnswersToStorage(String(student.mapel_id));

      showQuestion();
    });

    grid.appendChild(btn);
  }

  updateGrid();
}

function updateGrid() {
  const grid = document.getElementById("question-grid");
  const buttons = grid.querySelectorAll("button");

  buttons.forEach((btn, idx) => {
    btn.classList.remove("current", "answered");
    if (idx === currentIndex) btn.classList.add("current");
    if (answers[idx] !== null) btn.classList.add("answered");
    if (timeOver) btn.disabled = true;
  });
}

function updateProgress() {
  const answered = answers.filter(a => a !== null).length;
  const total = questions.length;

  const textEl = document.getElementById("progress-text");
  const barFill = document.getElementById("progress-bar-fill");

  textEl.textContent = `${answered} / ${total}`;
  barFill.style.width = `${(answered / total) * 100}%`;
}

/* ============================================================
   TIMER
   ============================================================ */

function setupTimer() {
  const display = document.getElementById("timer-display");

  let endTime = localStorage.getItem(LS_KEYS.endTime);

  if (!endTime) {
    endTime = Date.now() + EXAM_DURATION_MINUTES * 60 * 1000;
    localStorage.setItem(LS_KEYS.endTime, String(endTime));
  } else {
    endTime = Number(endTime);
  }

  function tick() {
    const now = Date.now();
    const diff = endTime - now;

    if (diff <= 0) {
      clearInterval(timerInterval);
      handleTimeOver();
      return;
    }

    const totalSec = Math.floor(diff / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;

    display.textContent =
      `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function handleTimeOver() {
  timeOver = true;

  document.getElementById("timer-display").textContent = "00:00";

  document
    .querySelectorAll('input[name="opsi"]')
    .forEach(el => (el.disabled = true));

  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;

  const grid = document.getElementById("question-grid");
  grid.querySelectorAll("button").forEach(btn => (btn.disabled = true));

  alert("Waktu habis! Klik Kirim Jawaban.");
}
/* ============================================================
   SUBMIT UJIAN
   ============================================================ */

async function submitExam(autoByTimer = false) {
  const stored = localStorage.getItem(LS_KEYS.student);
  if (!stored) {
    alert("Data siswa tidak ditemukan. Tidak bisa mengirim jawaban.");
    return;
  }
  const student = JSON.parse(stored);

  if (!questions.length) {
    alert("Tidak ada soal yang dimuat.");
    return;
  }

  // hitung skor
  let totalScore = 0;
  let maxScore = 0;
  let correctCount = 0;

  questions.forEach((q, idx) => {
    const bobot = Number(q.skor || 1) || 1;
    maxScore += bobot;
    const jawaban = (answers[idx] || "").toString().toUpperCase();
    const kunci = (q.kunci || "").toString().toUpperCase();

    if (jawaban && kunci && jawaban === kunci) {
      totalScore += bobot;
      correctCount++;
    }
  });

  const finalScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;

  if (!autoByTimer) {
    const ok = confirm(
      `Ringkasan:\nSoal dijawab: ${answers.filter(a => a !== null).length}/${questions.length}\n` +
      `Benar: ${correctCount}\nSkor: ${totalScore}/${maxScore}\nNilai akhir: ${finalScore}\n\nKirim sekarang?`
    );
    if (!ok) return;
  }

  const payload = {
    ujian_siswa_id: student.ujian_siswa_id ?? null,
    siswa_id: student.siswa_id ?? student.siswaId ?? student.id ?? null,
    nama: student.nama || "",
    kelas: student.kelas || "",
    nis: student.nis || "",
    nisn: student.nisn || "",
    mapel_id: student.mapel_id ?? student.mapelId ?? null,
    totalScore,
    maxScore,
    finalScore,
    answers: questions.map((q, idx) => ({
      soal_id: q.id,
      nomor: q.nomor ?? idx + 1,
      jawaban: answers[idx] ?? null,
      benar: q.kunci ? ((answers[idx] || "").toString().toUpperCase() === q.kunci.toString().toUpperCase()) : null,
      skor: q.kunci && ((answers[idx] || "").toString().toUpperCase() === q.kunci.toString().toUpperCase()) ? Number(q.skor || 1) : 0
    })),
    submittedAt: new Date().toISOString()
  };

  try {
    // coba kirim ke API
    await apiPost("/api/kirim-jawaban", payload);
  } catch (err) {
    console.warn("POST /api/kirim-jawaban gagal, menyimpan ke localStorage sebagai fallback.", err);
    // simpan lokal sebagai queue untuk dikirim nanti
    const pending = JSON.parse(localStorage.getItem("pending_submissions") || "[]");
    pending.push(payload);
    localStorage.setItem("pending_submissions", JSON.stringify(pending));
  }

  // bersihkan local
  localStorage.removeItem(LS_KEYS.student);
  localStorage.removeItem(LS_KEYS.endTime);
  localStorage.removeItem(LS_KEYS.answers);

  alert("Jawaban dikirim. Terima kasih.");
  window.location.href = "index.html";
}

/* ============================================================
   STIMULUS IMAGE HANDLERS (LOAD / ERROR)
   ============================================================ */

function attachStimulusImageHandlers() {
  const img = document.getElementById("stimulus-image");
  const wrap = document.getElementById("stimulus-img-wrap");
  const err = document.getElementById("stimulus-image-error");

  if (!img) return;

  img.addEventListener("load", () => {
    if (wrap) wrap.classList.remove("hidden");
    if (err) err.classList.add("hidden");
  });

  img.addEventListener("error", () => {
    if (wrap) wrap.classList.add("hidden");
    if (err) err.classList.remove("hidden");
    // hapus src supaya tidak terus memanggil
    try { img.removeAttribute("src"); } catch (e) {}
  });
}

/* ============================================================
   UTILITY: KIRIM PENDING SUBMISSIONS (optional manual trigger)
   ============================================================ */

async function flushPendingSubmissions() {
  const pending = JSON.parse(localStorage.getItem("pending_submissions") || "[]");
  if (!pending.length) return;
  for (const p of pending.slice()) {
    try {
      await apiPost("/api/kirim-jawaban", p);
      // remove from array
      const arr = JSON.parse(localStorage.getItem("pending_submissions") || "[]");
      arr.shift();
      localStorage.setItem("pending_submissions", JSON.stringify(arr));
    } catch (err) {
      console.warn("Masih gagal mengirim pending submission:", err);
      break; // hentikan loop, coba nanti
    }
  }
}

/* ============================================================
   AKHIR FILE
   ============================================================ */

/* catatan:
 - Pastikan file HTML memiliki elemen dengan id: siswa, mapel, student-summary-placeholder,
   student-summary-content, sum-nama, sum-absen, sum-kelas, sum-nis, sum-nisn, sum-jk,
   question-number, question-text, options-container, loading-questions, exam-content,
   prev-btn, next-btn, submit-btn, question-grid, progress-text, progress-bar-fill,
   timer-display, stimulus, stimulus-text, stimulus-img-wrap, stimulus-image, stimulus-image-error.
 - Jika API kamu pakai path lain, ubah API_BASE atau path di pemanggilan apiGet/apiPost.
 - Jika ingin non-GVIZ fallback, hapus pemanggilan fetchSheetRows dan penanganannya.
*/