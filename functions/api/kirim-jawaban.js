export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json();

  const { ujian_siswa_id, answers, finalScore } = body;

  // Validasi dasar
  if (!ujian_siswa_id || !Array.isArray(answers)) {
    return new Response(JSON.stringify({ error: "Data kurang" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let totalSkor = 0;
  let benarCount = 0;

  for (const ans of answers) {
    const soalId = ans.soal_id;
    if (!soalId) continue;

    const jawaban = (ans.jawaban || "").toString().toUpperCase();
    const benar = ans.benar ? 1 : 0;           // dari frontend
    const skor = Number(ans.skor || 0);        // dari frontend

    totalSkor += skor;
    if (benar) benarCount++;

    // ⚠ pakai kolom "ujian_siswa_id" sesuai dengan struktur tabel kamu
    await env.DB
      .prepare(
        `INSERT INTO jawaban (ujian_siswa_id, soal_id, jawaban, benar, skor)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(ujian_siswa_id, soalId, jawaban, benar, skor)
      .run();
  }

  // nilai akhir: pakai dari frontend kalau ada, kalau tidak pakai totalSkor
  const nilaiAkhir =
    typeof finalScore === "number" ? finalScore : totalSkor;

  await env.DB
    .prepare(
      `UPDATE ujian_siswa
       SET nilai = ?, waktu_selesai = datetime('now')
       WHERE id = ?`
    )
    .bind(nilaiAkhir, ujian_siswa_id)
    .run();

  return new Response(
    JSON.stringify({
      totalSkor,
      benarCount,
      finalScore: nilaiAkhir,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
