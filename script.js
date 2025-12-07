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
  answers: "exam_answers",
  questions: "exam_questions"
};

// Cache global
let STUDENT_LIST = [];
let questions = [];
let answers = [];
let currentIndex = 0;
let timerInterval = null;
let timeOver = false;

/* ============================================================
   UTILITY: SHUFFLE ARRAY
   ============================================================ */

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ============================================================
   API HELPER
   ============================================================ */

async function apiGet(path) {
  try {
    const res = await fetch(API_BASE + path);
    const ct = res.headers.get("content-type") || "";
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    if (!ct.includes("application/json")) {
      throw new Error("Non JSON response");
    }
    return await res.json();
  } catch (err) {
    console.error("[apiGet] error:", err);
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

    if (!res.ok) {
      throw new Error("HTTP POST error");
    }
    return await res.json();
  } catch (err) {
    console.error("[apiPost] error:", err);
    throw err;
  }
}

/* ============================================================
   DETEKSI HALAMAN
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "index") initIndexPage();
  if (page === "ujian") initExamPage();
  attachNavigationButtons();
  attachSubmitButton();
});

/* ============================================================
   INDEX PAGE — LOAD SISWA & MAPEL
   ============================================================ */

function initIndexPage() {
  loadSiswaForIndex();
  loadSubjectsForIndex();

  const form = document.getElementById("student-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const siswaId = document.getElementById("siswa").value;
    const mapelId = document.getElementById("mapel").value;

    const row = STUDENT_LIST.find((s) => String(s.id) === siswaId);
    if (!row) {
      alert("Data siswa tidak ditemukan.");
      return;
    }

    const mulai = await apiPost("/api/mulai-ujian", {
      siswa_id: Number(siswaId),
      mapel_id: Number(mapelId)
    });

    const studentData = {
      ujian_siswa_id: mulai.ujian_siswa_id,
      siswa_id: Number(siswaId),
      mapel_id: Number(mapelId),
      mapelNama:
        document.getElementById("mapel").selectedOptions[0].textContent,
      no_absen: row.no_absen,
      nama: row.nama,
      kelas: row.kelas,
      nis: row.nis,
      nisn: row.nisn,
      jk: row.jk
    };

    localStorage.setItem(LS_KEYS.student, JSON.stringify(studentData));
    localStorage.removeItem(LS_KEYS.endTime);
    localStorage.removeItem(LS_KEYS.answers);
    localStorage.removeItem(LS_KEYS.questions);

    window.location.href = "ujian.html";
  });
}

async function loadSiswaForIndex() {
  const select = document.getElementById("siswa");

  select.innerHTML = `<option>Memuat data...</option>`;
  try {
    const rows = await apiGet("/api/siswa");
    STUDENT_LIST = rows.slice();
    select.innerHTML = `<option value="">Pilih namamu</option>`;
    STUDENT_LIST.forEach((s, i) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `${s.no_absen} - ${s.nama} (Kelas ${s.kelas})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    select.innerHTML = `<option>Gagal load siswa</option>`;
  }
}

async function loadSubjectsForIndex() {
  const select = document.getElementById("mapel");
  select.innerHTML = `<option>Memuat mapel...</option>`;
  try {
    const rows = await apiGet("/api/mapel");
    select.innerHTML = `<option value="">Pilih mapel</option>`;
    rows.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.nama;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    select.innerHTML = `<option>Gagal load mapel</option>`;
  }
}
/* ============================================================
   HALAMAN UJIAN
   ============================================================ */

function initExamPage() {
  const stored = localStorage.getItem(LS_KEYS.student);
  if (!stored) {
    window.location = "index.html";
    return;
  }
  const student = JSON.parse(stored);
  document.getElementById("student-info").textContent =
    `${student.nama} | Absen ${student.no_absen} | Kelas ${student.kelas}`;

  setupTimer();
  loadQuestions(student.mapel_id);
}

/* ============================================================
   LOAD QUESTIONS — acak soal + acak opsi (dengan mapping kunci asli)
   ============================================================ */

async function loadQuestions(mapelId) {
  const loadingEl = document.getElementById("loading-questions");

  try {
    const rows = await apiGet(`/api/soal?mapel_id=${mapelId}`);

    const shuffledRows = shuffleArray(rows);
    const letters = ["A", "B", "C", "D"];

    questions = shuffledRows.map((r) => {
      const rawOptions = [
        { originalKey: "A", text: r.a },
        { originalKey: "B", text: r.b },
        { originalKey: "C", text: r.c },
        { originalKey: "D", text: r.d }
      ];

      const shuffledOptions = shuffleArray(rawOptions);

      const options = shuffledOptions.map((o, idx) => ({
        label: letters[idx], // huruf yang tampil di layar
        text: o.text,
        originalKey: o.originalKey.toUpperCase() // huruf asli sebelum diacak
      }));

      return {
        id: r.id,
        nomor: r.nomor,
        text: r.teks,
        options,
        correctKey: (r.kunci || "").trim().toUpperCase(), // kunci asli dari DB
        skor: Number(r.skor || 1),
        stimulus: r.stimulus || "",
        stimulusImageUrl: r.stimulus_url_gambar || ""
      };
    });

    answers = new Array(questions.length).fill(null);

    localStorage.setItem(
      LS_KEYS.questions,
      JSON.stringify({ mapel_id: mapelId, questions })
    );

    document.getElementById("exam-content").classList.remove("hidden");
    buildQuestionGrid();
    showQuestion();
    updateProgress();
  } catch (err) {
    console.error(err);
    loadingEl.textContent = "Gagal load soal";
  }
}

/* ============================================================
   TAMPILKAN SOAL
   ============================================================ */

function showQuestion() {
  const q = questions[currentIndex];
  if (!q) return;

  const numEl = document.getElementById("question-number");
  const textEl = document.getElementById("question-text");
  const optionsEl = document.getElementById("options-container");

  numEl.textContent = `Soal ${currentIndex + 1}`;
  textEl.textContent = q.text;

  optionsEl.innerHTML = "";
  const currentAnswer = answers[currentIndex]; // label A/B/C/D

  q.options.forEach((opt) => {
    const label = document.createElement("label");
    label.className = "option-item";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "opsi";
    input.value = opt.label;
    input.checked = currentAnswer === opt.label;
    input.disabled = timeOver;

    input.addEventListener("change", () => {
      if (timeOver) return;
      answers[currentIndex] = opt.label;
      updateGrid();
      updateProgress();
    });

    label.appendChild(input);
    label.append(` ${opt.label}. ${opt.text}`);
    optionsEl.appendChild(label);
  });

  updateGrid();
}
/* ============================================================
   GRID NAVIGASI SOAL
   ============================================================ */

function buildQuestionGrid() {
  const grid = document.getElementById("question-grid");
  grid.innerHTML = "";
  for (let i = 0; i < questions.length; i++) {
    const btn = document.createElement("button");
    btn.textContent = i + 1;
    btn.addEventListener("click", () => {
      currentIndex = i;
      showQuestion();
      updateGrid();
    });
    grid.appendChild(btn);
  }
}

function updateGrid() {
  const grid = document.getElementById("question-grid");
  grid.querySelectorAll("button").forEach((btn, idx) => {
    btn.classList.remove("current", "answered");
    if (idx === currentIndex) btn.classList.add("current");
    if (answers[idx] !== null) btn.classList.add("answered");
  });
}

function updateProgress() {
  const answered = answers.filter((a) => a !== null).length;
  const total = questions.length || 1;
  document.getElementById(
    "progress-text"
  ).textContent = `${answered}/${total}`;
  document.getElementById("progress-bar-fill").style.width = `${
    (answered / total) * 100
  }%`;
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
    display.textContent = `${String(min).padStart(2, "0")}:${String(
      sec
    ).padStart(2, "0")}`;
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function handleTimeOver() {
  timeOver = true;
  document.getElementById("timer-display").textContent = "00:00";
  alert("Waktu habis! Klik Kirim Jawaban.");
}
/* ============================================================
   SUBMIT UJIAN
   ============================================================ */

async function submitExam() {
  const stored = localStorage.getItem(LS_KEYS.student);
  if (!stored) return alert("Data siswa tidak ada!");

  const student = JSON.parse(stored);

  let totalScore = 0;
  let maxScore = 0;
  let correct = 0;

  questions.forEach((q, idx) => {
    const bobot = Number(q.skor || 1);
    maxScore += bobot;

    const selectedLabel = answers[idx]; // A/B/C/D yang dipilih
    const selectedOption = q.options.find(
      (o) => o.label === selectedLabel
    );

    const isCorrect =
      selectedOption &&
      selectedOption.originalKey === q.correctKey;

    if (isCorrect) {
      totalScore += bobot;
      correct++;
    }
  });

  const finalScore =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  const ok = confirm(
    `Jawaban terjawab: ${
      answers.filter((a) => a !== null).length
    }/${questions.length}\n` +
      `Benar: ${correct}\n` +
      `Skor: ${totalScore}/${maxScore}\n` +
      `Nilai akhir: ${finalScore}\n\n` +
      `Kirim?`
  );
  if (!ok) return;

  try {
    await apiPost("/api/kirim-jawaban", {
      ujian_siswa_id: student.ujian_siswa_id,
      siswa_id: student.siswa_id,
      mapel_id: student.mapel_id,
      finalScore,
      answers: questions.map((q, idx) => {
        const bobot = Number(q.skor || 1);
        const selectedLabel = answers[idx];
        const selectedOption = q.options.find(
          (o) => o.label === selectedLabel
        );
        const isCorrect =
          selectedOption &&
          selectedOption.originalKey === q.correctKey;

        return {
          soal_id: q.id,
          jawaban: selectedLabel,
          benar: isCorrect,
          skor: isCorrect ? bobot : 0
        };
      })
    });

    localStorage.clear();
    alert("Jawaban terkirim.");
    window.location = "index.html";
  } catch (err) {
    console.error(err);
    alert("Gagal kirim jawaban.");
  }
}

/* ============================================================
   BUTTON NAVIGATION + SUBMIT
   ============================================================ */

function attachNavigationButtons() {
  const prev = document.getElementById("prev-btn");
  const next = document.getElementById("next-btn");

  if (prev) {
    prev.addEventListener("click", () => {
      if (currentIndex > 0) {
        currentIndex--;
        showQuestion();
      }
    });
  }

  if (next) {
    next.addEventListener("click", () => {
      if (currentIndex < questions.length - 1) {
        currentIndex++;
        showQuestion();
      }
    });
  }
}

function attachSubmitButton() {
  const btn = document.getElementById("submit-btn");
  if (!btn) return;
  btn.addEventListener("click", () => submitExam());
}

/* ============================================================
   AKHIR SCRIPT
   ============================================================ */