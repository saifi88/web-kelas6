// ======================================
// KONFIGURASI GLOBAL
// ======================================

// Basis URL API (kalau Pages & API di domain yang sama, biarkan kosong "")
const API_BASE = "";

// Lama ujian (menit)
const EXAM_DURATION_MINUTES = 60;

// LocalStorage Key
const LS_KEYS = {
  student: "exam_student_info",
  endTime: "exam_end_time",
  answers: "exam_answers"
};

// Cache data
let STUDENT_LIST = [];

// Data ujian (halaman ujian)
let questions = [];
let answers = [];
let currentIndex = 0;
let timerInterval = null;
let timeOver = false;

// ======================================
// HELPER API
// ======================================

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} gagal: ${res.status} ${text}`);
  }
  return res.json();
}

async function apiPost(path, data) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} gagal: ${res.status} ${text}`);
  }
  return res.json();
}

// ======================================
// DETEKSI HALAMAN
// ======================================

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;

  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  if (page === "index") initIndexPage();
  if (page === "ujian") initExamPage();
});

// ======================================
// INDEX PAGE
// ======================================

function initIndexPage() {
  loadSiswaForIndex();
  loadSubjectsForIndex();

  const form = document.getElementById("student-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const siswaSelect = document.getElementById("siswa");
    const mapelSelect = document.getElementById("mapel");

    const siswaId = siswaSelect ? siswaSelect.value : "";
    const mapelId = mapelSelect ? mapelSelect.value : "";

    if (!siswaId) {
      alert("Silakan pilih nama siswa terlebih dahulu.");
      return;
    }

    if (!mapelId) {
      alert("Silakan pilih mata pelajaran ujian.");
      return;
    }

    const studentRow = STUDENT_LIST.find(
      (s) => String(s.id) === String(siswaId)
    );
    if (!studentRow) {
      alert("Data siswa tidak ditemukan. Silakan lapor guru.");
      return;
    }

    try {
      // Panggil API untuk membuat record ujian_siswa
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

        no_absen: String(studentRow.no_absen || "").trim(),
        nama: String(studentRow.nama || "").trim(),
        kelas: String(studentRow.kelas || "").trim(),
        nis: String(studentRow.nis || "").trim(),
        nisn: String(studentRow.nisn || "").trim(),
        jk: String(studentRow.jk || "").trim()
      };

      localStorage.setItem(LS_KEYS.student, JSON.stringify(studentData));
      localStorage.removeItem(LS_KEYS.endTime);
      localStorage.removeItem(LS_KEYS.answers);

      window.location.href = "ujian.html";
    } catch (err) {
      console.error(err);
      alert("Gagal memulai ujian. Coba lagi atau lapor guru.");
    }
  });
}

async function loadSiswaForIndex() {
  const select = document.getElementById("siswa");
  const info = document.getElementById("siswa-info");
  if (!select) return;

  select.disabled = true;
  select.innerHTML = `<option value="">Memuat daftar siswa...</option>`;

  try {
    const rows = await apiGet("/api/siswa");
    // rows = [{id, no_absen, nama, kelas, nis, nisn, jk}, ...]
    STUDENT_LIST = rows.slice();

    // Urutkan berdasarkan kelas lalu nama
    STUDENT_LIST.sort((a, b) => {
      const ka = String(a.kelas || "");
      const kb = String(b.kelas || "");
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      const na = String(a.nama || "").toLowerCase();
      const nb = String(b.nama || "").toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    });


    select.innerHTML = "";

    if (!STUDENT_LIST.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Belum ada data siswa.";
      select.appendChild(opt);
      select.disabled = true;
      if (info) {
        info.textContent = "Pastikan tabel 'siswa' di D1 sudah terisi.";
      }
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Pilih nama siswa...";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

   STUDENT_LIST.forEach((s, index) => {
  const opt = document.createElement("option");
  const absen = String(index + 1).padStart(2, "0"); // nomor urut di dropdown
  const nama = String(s.nama || "").trim();
  const kelas = String(s.kelas || "").trim();

  // simpan absen virtual untuk ringkasan
  s._absen = index + 1;

  opt.value = String(s.id);
  opt.textContent = `${absen} - ${nama} (Kelas ${kelas})`;
  select.appendChild(opt);
});

    select.disabled = false;
    if (info) {
      info.textContent = "Pilih namamu sesuai daftar hadir kelas.";
    }

    select.addEventListener("change", () => {
      const id = Number(select.value);
      const row = STUDENT_LIST.find((s) => Number(s.id) === id);
      updateStudentSummary(row);
    });
  } catch (err) {
    console.error(err);
    select.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Gagal memuat daftar siswa.";
    select.appendChild(opt);
    select.disabled = true;
    if (info) {
      info.textContent = "Periksa API /api/siswa dan koneksi internet.";
    }
  }
}

function updateStudentSummary(row) {
  const placeholder = document.getElementById("student-summary-placeholder");
  const content = document.getElementById("student-summary-content");

  if (!placeholder || !content) return;

  if (!row) {
    placeholder.classList.remove("hidden");
    content.classList.add("hidden");
    return;
  }

  const namaEl = document.getElementById("sum-nama");
  const absenEl = document.getElementById("sum-absen");
  const kelasEl = document.getElementById("sum-kelas");
  const nisEl = document.getElementById("sum-nis");
  const nisnEl = document.getElementById("sum-nisn");
  const jkEl = document.getElementById("sum-jk");

  if (namaEl) namaEl.textContent = String(row.nama || "").trim();
  if (absenEl) absenEl.textContent = String(row._absen || "").trim();
  if (kelasEl) kelasEl.textContent = String(row.kelas || "").trim();
  if (nisEl) nisEl.textContent = String(row.nis || "").trim();
  if (nisnEl) nisnEl.textContent = String(row.nisn || "").trim();
  if (jkEl) jkEl.textContent = String(row.jk || "").trim();

  placeholder.classList.add("hidden");
  content.classList.remove("hidden");
}

async function loadSubjectsForIndex() {
  const select = document.getElementById("mapel");
  const info = document.getElementById("mapel-info");
  if (!select) return;

  select.disabled = true;
  select.innerHTML = `<option>Memuat daftar mata pelajaran...</option>`;

  try {
    const rows = await apiGet("/api/mapel"); // [{id, nama}, ...]

    select.innerHTML = "";

    if (!rows.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Tidak ada mata pelajaran.";
      select.appendChild(opt);
      select.disabled = true;
      if (info) {
        info.textContent = "Pastikan tabel 'mapel' di D1 sudah terisi.";
      }
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Pilih mata pelajaran...";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    rows.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = String(m.id); // simpan id mapel
      opt.textContent = m.nama;
      select.appendChild(opt);
    });

    select.disabled = false;
    if (info) {
      info.textContent = "Pilih mata pelajaran yang akan dikerjakan.";
    }
  } catch (err) {
    console.error(err);
    select.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Gagal memuat mata pelajaran.";
    select.appendChild(opt);
    select.disabled = true;
    if (info) {
      info.textContent = "Periksa API /api/mapel dan koneksi internet.";
    }
  }
}

// ======================================
// UJIAN PAGE
// ======================================

function initExamPage() {
  const stored = localStorage.getItem(LS_KEYS.student);
  if (!stored) {
    alert("Data siswa tidak ditemukan. Silakan mulai dari halaman awal.");
    window.location.href = "index.html";
    return;
  }

  const student = JSON.parse(stored);
  const infoEl = document.getElementById("student-info");
  if (infoEl) {
    const nama = student.nama || "";
    const absen = student.id || student.no_absen || "";
    const kelas = student.kelas || "";
    const mapelNama = student.mapelNama || "";
    infoEl.textContent =
      `${nama} | Absen ${absen} | Kelas ${kelas} | Mapel ${mapelNama}`;
  }

  setupTimer();
  loadQuestions(student.mapel_id);
}

async function loadQuestions(mapelId) {
  const loadingEl = document.getElementById("loading-questions");
  const examContentEl = document.getElementById("exam-content");

  if (loadingEl) {
    loadingEl.textContent = "Memuat soal dari database...";
  }

  try {
    const rows = await apiGet(`/api/soal?mapel_id=${encodeURIComponent(mapelId)}`);
    // rows: [{id, nomor, teks, a, b, c, d}, ...]

    if (!rows.length) {
      throw new Error(`Tidak ada soal untuk mata pelajaran ini.`);
    }

    questions = rows.map((row) => ({
      id: row.id,
      nomor: row.nomor,
      text: String(row.teks || ""),
      options: [
        String(row.a || ""),
        String(row.b || ""),
        String(row.c || ""),
        String(row.d || "")
      ],
      stimulus: String(row.stimulus || "")
    }));

    answers = new Array(questions.length).fill(null);

    const student = JSON.parse(localStorage.getItem(LS_KEYS.student) || "{}");
    restoreAnswersFromStorage(String(student.mapel_id || ""));

    if (loadingEl) loadingEl.classList.add("hidden");
    if (examContentEl) examContentEl.classList.remove("hidden");

    buildQuestionGrid();
    showQuestion();
    updateProgress();

    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    const submitBtn = document.getElementById("submit-btn");

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (timeOver) return;
        if (currentIndex > 0) {
          currentIndex--;
          const s = JSON.parse(localStorage.getItem(LS_KEYS.student) || "{}");
          saveAnswersToStorage(String(s.mapel_id || ""));
          showQuestion();
        }
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        if (timeOver) return;
        if (currentIndex < questions.length - 1) {
          currentIndex++;
          const s = JSON.parse(localStorage.getItem(LS_KEYS.student) || "{}");
          saveAnswersToStorage(String(s.mapel_id || ""));
          showQuestion();
        }
      };
    }

    if (submitBtn) {
      submitBtn.onclick = () => submitExam(false);
    }
  } catch (err) {
    console.error(err);
    if (loadingEl) {
      loadingEl.textContent = err.message || "Gagal memuat soal.";
    }
  }
}

function showQuestion() {
  if (!questions.length) return;

  const q = questions[currentIndex];
  const numEl = document.getElementById("question-number");
  const textEl = document.getElementById("question-text");
  const optionsEl = document.getElementById("options-container");
  const stimulusEl = document.getElementById("stimulus");

  if (numEl) numEl.textContent = `Soal ${currentIndex + 1}`;
  // tampilkan stimulus kalau ada
  if (stimulusEl) {
    if (q.stimulus || q.stimulusImageUrl) {
      let html = "";

      if (q.stimulus) {
        html += `<p>${q.stimulus.replace(/\n/g, "<br>")}</p>`;
      }

      if (q.stimulusImageUrl) {
        html += `<div class="stimulus-image"><img src="${q.stimulusImageUrl}" alt="Stimulus" /></div>`;
      }

      stimulusEl.innerHTML = html;
      stimulusEl.classList.remove("hidden");
    } else {
      stimulusEl.innerHTML = "";
      stimulusEl.classList.add("hidden");
    }
  }
  if (textEl) textEl.textContent = q.text;
  if (!optionsEl) return;

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
      const student = JSON.parse(localStorage.getItem(LS_KEYS.student) || "{}");
      saveAnswersToStorage(String(student.mapel_id || ""));
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

  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  if (prevBtn) prevBtn.disabled = timeOver || currentIndex === 0;
  if (nextBtn) nextBtn.disabled = timeOver || currentIndex === questions.length - 1;

  updateGrid();
  // 🔥 PANGGIL MATHJAX UNTUK TEX
  if (window.MathJax && window.MathJax.typesetPromise) {
    const elems = [textEl, optionsEl, stimulusEl].filter(Boolean);
    MathJax.typesetPromise(elems).catch((err) =>
      console.error("MathJax typeset error:", err)
    );
  }
}

// ======================================
// AUTOSAVE JAWABAN
// ======================================

function saveAnswersToStorage(mapelKey) {
  try {
    const payload = {
      mapelKey: String(mapelKey || ""),
      currentIndex,
      answers,
      savedAt: Date.now()
    };
    localStorage.setItem(LS_KEYS.answers, JSON.stringify(payload));
  } catch (e) {
    console.warn("Gagal menyimpan jawaban ke localStorage:", e);
  }
}

function restoreAnswersFromStorage(mapelKey) {
  try {
    const raw = localStorage.getItem(LS_KEYS.answers);
    if (!raw) return;
    const data = JSON.parse(raw);

    if (
      data.mapelKey === String(mapelKey || "") &&
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
    console.warn("Gagal me-restore jawaban dari LocalStorage:", e);
  }
}

// ======================================
// GRID & PROGRESS
// ======================================

function buildQuestionGrid() {
  const grid = document.getElementById("question-grid");
  if (!grid) return;

  grid.innerHTML = "";

  for (let i = 0; i < questions.length; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = i + 1;
    btn.disabled = timeOver;
    btn.addEventListener("click", () => {
      if (timeOver) return;
      currentIndex = i;
      const student = JSON.parse(localStorage.getItem(LS_KEYS.student) || "{}");
      saveAnswersToStorage(String(student.mapel_id || ""));
      showQuestion();
    });
    grid.appendChild(btn);
  }

  updateGrid();
}

function updateGrid() {
  const grid = document.getElementById("question-grid");
  if (!grid) return;

  const buttons = grid.querySelectorAll("button");
  buttons.forEach((btn, idx) => {
    btn.classList.remove("current", "answered");
    if (idx === currentIndex) btn.classList.add("current");
    if (answers[idx] !== null) btn.classList.add("answered");
    if (timeOver) btn.disabled = true;
  });
}

function updateProgress() {
  const answered = answers.filter((a) => a !== null).length;
  const total = questions.length || 0;
  const textEl = document.getElementById("progress-text");
  const barFill = document.getElementById("progress-bar-fill");

  if (!textEl || !barFill || total === 0) return;

  textEl.textContent = `${answered} / ${total}`;
  barFill.style.width = `${(answered / total) * 100}%`;
}

// ======================================
// TIMER
// ======================================

function setupTimer() {
  const display = document.getElementById("timer-display");
  if (!display) return;

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

    const totalSeconds = Math.floor(diff / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    display.textContent =
      String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function handleTimeOver() {
  timeOver = true;

  const display = document.getElementById("timer-display");
  if (display) display.textContent = "00:00";

  document
    .querySelectorAll('input[name="opsi"]')
    .forEach((el) => (el.disabled = true));

  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;

  const grid = document.getElementById("question-grid");
  if (grid) {
    grid.querySelectorAll("button").forEach((btn) => (btn.disabled = true));
  }

  alert(
    "Waktu ujian telah habis.\nSilakan klik tombol 'Kirim Jawaban' untuk mengirim hasil."
  );
}

// ======================================
// SUBMIT KE API D1
// ======================================

async function submitExam(autoByTimer) {
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

  const answersPayload = [];
  questions.forEach((q, idx) => {
    const jawaban = answers[idx];
    if (!jawaban) return;
    answersPayload.push({
      soal_id: q.id,
      jawaban: jawaban.toUpperCase()
    });
  });

  if (!answersPayload.length) {
    if (!confirm("Anda belum menjawab satupun soal. Tetap kirim?")) return;
  } else if (!autoByTimer) {
    const ok = confirm(
      "Yakin akan mengirim jawaban? Setelah dikirim, jawaban tidak bisa diubah."
    );
    if (!ok) return;
  }

  try {
    const result = await apiPost("/api/kirim-jawaban", {
      ujian_siswa_id: student.ujian_siswa_id,
      answers: answersPayload
    });

    alert(
      "Ringkasan nilai:\n" +
        `Jawaban benar: ${result.benarCount}\n` +
        `Total skor: ${result.totalSkor} dari ${result.maxSkor}\n` +
        `Nilai akhir: ${result.finalScore}`
    );

    // Bersihkan localStorage supaya tidak bisa lanjut
    localStorage.removeItem(LS_KEYS.student);
    localStorage.removeItem(LS_KEYS.endTime);
    localStorage.removeItem(LS_KEYS.answers);

    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    alert("Gagal mengirim jawaban ke server. Coba lagi atau lapor guru.");
  }
}





