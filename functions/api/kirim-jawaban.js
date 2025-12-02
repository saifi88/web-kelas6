export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json();
  const { ujian_siswa_id, answers } = body;

  if (!ujian_siswa_id || !Array.isArray(answers)) {
    return new Response(JSON.stringify({ error: "Data kurang" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let totalSkor = 0;
  let maxSkor = 0;
  let benarCount = 0;

  for (const ans of answers) {
    const { soal_id, jawaban } = ans;
    if (!soal_id || !jawaban) continue;

    const soal = await env.DB
      .prepare("SELECT kunci, skor FROM soal WHERE id = ?")
      .bind(soal_id)
      .first();

    if (!soal) continue;

    const skor = Number(soal.skor || 0);
    maxSkor += skor;

    const isBenar = jawaban.toUpperCase() === String(soal.kunci || "").toUpperCase();
    if (isBenar) {
      totalSkor += skor;
      benarCount++;
    }

    await env.DB
      .prepare(
        `INSERT INTO jawaban (ujian_siswa_id, soal_id, jawaban, benar)
         VALUES (?, ?, ?, ?)`
      )
      .bind(ujian_siswa_id, soal_id, jawaban.toUpperCase(), isBenar ? 1 : 0)
      .run();
  }

  const finalScore =
    maxSkor > 0 ? Math.round((totalSkor / maxSkor) * 10000) / 100 : 0;

  await env.DB
    .prepare(
      `UPDATE ujian_siswa
       SET nilai = ?, waktu_selesai = datetime('now')
       WHERE id = ?`
    )
    .bind(finalScore, ujian_siswa_id)
    .run();

  return new Response(
    JSON.stringify({
      totalSkor,
      maxSkor,
      benarCount,
      finalScore,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
