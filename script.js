// ======================================
// GLOBAL CONFIG
// ======================================

const API_BASE = ""; // kosong kalau Pages & API di satu domain
const EXAM_DURATION_MINUTES = 60;

const LS_KEYS = {
  student: "exam_student_info",
  endTime: "exam_end_time",
  answers: "exam_answers"
};

// runtime state
let STUDENT_LIST = [];
let questions = [];
let answers = [];
let currentIndex = 0;
let timerInterval = null;
let timeOver = false;

// ======================================
// HELPERS: API
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
// BOOT
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

    const studentRow = STUDENT_LIST.find((s) => String(s.id) === String(siswaId));
    if (!studentRow) {
      alert("Data siswa tidak ditemukan. Silakan lapor guru.");
      return;
    }

    try {
      // buat record ujian_siswa via API (jika ada)
      let mulai = {};
      try {
        mulai = await apiPost("/api/mulai-ujian", {
          siswa_id: Number(siswaId),
          mapel_id: Number(mapelId)
        });
      } catch (err) {
        // jika API tidak tersedia, tetap lanjut tanpa ujian_siswa_id
        console.warn("API mulai-ujian gagal, lanjut tanpa id:", err);
      }

      const mapelNama = mapelSelect.options[mapelSelect.selectedIndex]?.textContent || "";

      const studentData = {
        ujian_siswa_id: mulai.ujian_siswa_id ?? null,
        siswa_id: Number(siswaId),
        mapel_id: Number(mapelId),
        mapelNama,

        no_absen: String(studentRow.no_absen || studentRow._absen || "").trim(),
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
    STUDENT_LIST = Array.isArray(rows) ? rows.slice() : [];

    // urutkan kelas -> nama
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
      if (info) info.textContent = "Pastikan tabel 'siswa' di D1 sudah terisi.";
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
      const absen = String(s.no_absen ?? s._absen ?? index + 1).padStart(2, "0");
      const nama = String(s.nama || "").trim();
      const kelas = String(s.kelas || "").trim();

      s._absen = Number(s.no_absen ?? s._absen ?? index + 1);

      opt.value = String(s.id);
      opt.textContent = `${absen} - ${nama} (Kelas ${kelas})`;
      select.appendChild(opt);
    });

    select.disabled = false;
    if (info) info.textContent = "Pilih namamu sesuai daftar hadir kelas.";

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
    if (info) info.textContent = "Periksa API /api/siswa dan koneksi internet.";
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
  if (absenEl) absenEl.textContent = String(row._absen || row.no_absen || "").trim();
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
    const rows = await apiGet("/api/mapel"); // expect [{id,nama},...]
    select.innerHTML = "";

    if (!Array.isArray(rows) || rows.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Tidak ada mata pelajaran.";
      select.appendChild(opt);
      select.disabled = true;
      if (info) info.textContent = "Pastikan tabel 'mapel' di D1 sudah terisi.";
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
      opt.value = String(m.id);
      opt.textContent = m.nama;
      select.appendChild(opt);
    });

    select.disabled = false;
    if (info) info.textContent = "Pilih mata pelajaran yang akan dikerjakan.";
  } catch (err) {
    console.error(err);
    select.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Gagal memuat mata pelajaran.";
    select.appendChild(opt);
    select.disabled = true;
    if (info) info.textContent = "Periksa API /api/mapel dan koneksi internet.";
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
    const absen = student.no_absen || student.siswa_id || "";
    const kelas = student.kelas || "";
    const mapelNama = student.mapelNama || "";
    infoEl.textContent = `${nama} | Absen ${absen} | Kelas ${kelas} | Mapel ${mapelNama}`;
  }

  setupTimer();
  loadQuestions(student.mapel_id ?? student.mapelId ?? student.mapel ?? "");
}

async function loadQuestions(mapelId) {
  const loadingEl = document.getElementById("loading-questions");
  const examContentEl = document.getElementById("exam-content");

  if (loadingEl) loadingEl.textContent = "Memuat soal dari database...";

  try {
    const rows = await apiGet(`/api/soal?mapel_id=${encodeURIComponent(mapelId)}`);

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Tidak ada soal untuk mata pelajaran ini.");
    }

    // robust mapping: terima berbagai nama kolom
    questions = rows.map((row) => {
      const text = row.teks ?? row.soal ?? row.text ?? row.question ?? "";
      const nomor = row.nomor ?? row.no ?? row.number ?? null;

      const imgUrl =
        row.stimulus_url_gambar ??
        row.stimulus_image_url ??
        row.stimulusImageUrl ??
        row.image_url ??
        row.gambar ??
        "";

      const stimulusText = row.stimulus ?? row.stimulus_text ?? "";

      return {
        id: row.id,
        nomor,
        text: String(text || ""),
        options: [
          String(row.a ?? row.option_a ?? ""),
          String(row.b ?? row.option_b ?? ""),
          String(row.c ?? row.option_c ?? ""),
          String(row.d ?? row.option_d ?? "")
        ],
        kunci: (row.kunci ?? row.k ?? row.answer ?? "").toString().trim().toUpperCase(),
        skor: Number(row.skor ?? row.weight ?? 1) || 1,
        stimulus: String(stimulusText || ""),
        stimulusImageUrl: String(imgUrl || ""),
        stimulus_alt: String(row.stimulus_alt ?? row.alt ?? "")
      };
    });

    answers = new Array(questions.length).fill(null);

    const student = JSON.parse(localStorage.getItem(LS_KEYS.student) || "{}");
    restoreAnswersFromStorage(String(student.mapel_id ?? student.mapelId ?? ""));

    if (loadingEl) loadingEl.classList.add("hidden");
    if (examContentEl) examContentEl.classList.remove("hidden");

    buildQuestionGrid();
    showQuestion();
    updateProgress();

    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    const submitBtn = document.getElementById("submit-btn");

    if (prevBtn) prevBtn.onclick = () => {
      if (timeOver) return;
      if (currentIndex > 0) {
        currentIndex--;
        const s = JSON.parse(localStorage.getItem(LS_KEYS.student) || "{}");
        saveAnswersToStorage(String(s.mapel_id ?? s.mapelId ?? ""));
        showQuestion();
      }
    };
    if (nextBtn) nextBtn.onclick = () => {
      if (timeOver) return;
      if (currentIndex < questions.length - 1) {
        currentIndex++;
        const s = JSON.parse(localStorage.getItem(LS_KEYS.student) || "{}");
        saveAnswersToStorage(String(s.mapel_id ?? s.mapelId ?? ""));
        showQuestion();
      }
    };
    if (submitBtn) submitBtn.onclick = () => submitExam(false);
  } catch (err) {
    console.error(err);
    if (loadingEl) loadingEl.textContent = err.message || "Gagal memuat soal.";
  }
}

function showQuestion() {
  if (!questions.length) return;

  const q = questions[currentIndex];
  const numEl = document.getElementById("question-number");
  const textEl = document.getElementById("question-text");
  const optionsEl = document.getElementById("options-container");

  const stimulusEl = document.getElementById("stimulus");
  const stimulusTextEl = document.getElementById("stimulus-text");
  const stimulusImgWrap = document.getElementById("stimulus-img-wrap");
  const stimulusImg = document.getElementById("stimulus-image");

  if (numEl) numEl.textContent = `Soal ${currentIndex + 1}`;

  // STIMULUS: teks
  if (stimulusTextEl) {
    if (q.stimulus) {
      stimulusTextEl.textContent = q.stimulus;
      stimulusTextEl.classList.remove("hidden");
    } else {
      stimulusTextEl.textContent = "";
      stimulusTextEl.classList.add("hidden");
    }
  }

  // STIMULUS: gambar -> set src but don't show wrapper until load event
  if (stimulusImg) {
    if (q.stimulusImageUrl) {
      // hide wrapper while loading
      if (stimulusImgWrap) stimulusImgWrap.classList.add("hidden");
      const errEl = document.getElementById("stimulus-image-error");
      if (errEl) errEl.classList.add("hidden");

      if (stimulusImg.getAttribute("src") !== q.stimulusImageUrl) {
        stimulusImg.setAttribute("src", q.stimulusImageUrl);
      }
      stimulusImg.alt = q.stimulus_alt || "Stimulus soal";
    } else {
      // remove src and hide
      stimulusImg.removeAttribute("src");
      stimulusImg.alt = "";
      if (stimulusImgWrap) stimulusImgWrap.classList.add("hidden");
    }
  }

  // show/hide stimulus container depending on presence
  if (stimulusEl) {
    if ((q.stimulus && q.stimulus.trim() !== "") || (q.stimulusImageUrl && q.stimulusImageUrl.trim() !== "")) {
      stimulusEl.classList.remove("hidden");
    } else {
      stimulusEl.classList.add("hidden");
    }
  }

  // TULIS SOAL
  if (textEl) textEl.textContent = q.text || "";

  if (!optionsEl) return;
  optionsEl.innerHTML = "";

  const letters = ["A", "B", "C", "D"];
  const currentAnswer = answers[currentIndex];

  letters.forEach((letter, idx) => {
    const optText = q.options[idx];
    if (!optText || String(optText).trim() === "") return;

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
      saveAnswersToStorage(String(student.mapel_id ?? student.mapelId ?? ""));
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

  // MathJax typeset (only on needed elements)
  if (window.MathJax && window.MathJax.typesetPromise) {
    const elems = [textEl, optionsEl, stimulusEl].filter(Boolean);
    MathJax.typesetPromise(elems).catch((err) => console.error("MathJax typeset error:", err));
  }
}

// ======================================
// AUTOSAVE
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
      currentIndex = Math.min(Math.max(data.currentIndex || 0, 0), questions.length - 1);
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
      saveAnswersToStorage(String(student.mapel_id ?? student.mapelId ?? ""));
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
    display.textContent = String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function handleTimeOver() {
  timeOver = true;
  const display = document.getElementById("timer-display");
  if (display) display.textContent = "00:00";
  document.querySelectorAll('input[name="opsi"]').forEach((el) => (el.disabled = true));
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;
  const grid = document.getElementById("question-grid");
  if (grid) grid.querySelectorAll("button").forEach((btn) => (btn.disabled = true));
  alert("Waktu ujian telah habis.\nSilakan klik tombol 'Kirim Jawaban' untuk mengirim hasil.");
}

// ======================================
// SUBMIT / NILAI
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

  let totalScore = 0;
  let maxScore = 0;
  let correctCount = 0;

  questions.forEach((q, idx) => {
    const bobot = Number(q.skor || 1) || 1;
    maxScore += bobot;

    const jawaban = (answers[idx] || "").toString().toUpperCase();
    if (jawaban && q.kunci && jawaban === q.kunci.toString().toUpperCase()) {
      totalScore += bobot;
      correctCount++;
    }
  });

  const finalScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;

  // konfirmasi singkat
  if (!autoByTimer) {
    const ok = confirm(
      `Ringkasan nilai:\nSoal dijawab: ${answers.filter(a => a !== null).length}/${questions.length}\nJawaban benar: ${correctCount}\nTotal skor: ${totalScore} dari ${maxScore}\nNilai akhir: ${finalScore}\n\nKirim jawaban sekarang?`
    );
    if (!ok) return;
  }

  // susun payload
  const payload = {
    ujian_siswa_id: student.ujian_siswa_id ?? null,
    siswa_id: student.siswa_id ?? student.id ?? null,
    nama: student.nama ?? "",
    kelas: student.kelas ?? "",
    nis: student.nis ?? "",
    nisn: student.nisn ?? "",
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
    // kirim ke API jika tersedia
    try {
      await apiPost("/api/kirim-jawaban", payload);
    } catch (err) {
      console.warn("POST /api/kirim-jawaban gagal, fallback: simpan di console.", err);
      // fallback: simpan copy di localStorage rekap (agar guru bisa ambil)
      const history = JSON.parse(localStorage.getItem("exam_submissions") || "[]");
      history.push(payload);
      localStorage.setItem("exam_submissions", JSON.stringify(history));
    }

    // bersihkan localStorage dan redirect / tampil pesan
    localStorage.removeItem(LS_KEYS.student);
    localStorage.removeItem(LS_KEYS.endTime);
    localStorage.removeItem(LS_KEYS.answers);

    alert("Jawaban berhasil dikirim. Terima kasih.");
    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    alert("Gagal mengirim jawaban. Coba lagi atau lapor guru.");
  }
}

// ======================================
// IMAGE LOAD / ERROR HANDLERS (optional attach)
// ======================================

// attach handlers if elements exist (for showing/hiding wrapper)
document.addEventListener("DOMContentLoaded", () => {
  const img = document.getElementById("stimulus-image");
  const wrap = document.getElementById("stimulus-img-wrap");
  const err = document.getElementById("stimulus-image-error");

  if (!img) return;

  img.addEventListener("error", () => {
    img.removeAttribute("src");
    if (wrap) wrap.classList.add("hidden");
    if (err) err.classList.remove("hidden");
  });

  img.addEventListener("load", () => {
    if (wrap) {
      wrap.classList.remove("hidden");
      wrap.setAttribute("aria-hidden", "false");
    }
    if (err) err.classList.add("hidden");
  });
});

// End of file


---
