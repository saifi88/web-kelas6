export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json();
  const { siswa_id, mapel_id } = body;

  if (!siswa_id || !mapel_id) {
    return new Response(JSON.stringify({ error: "siswa_id dan mapel_id wajib" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // pastikan siswa & mapel ada
  const siswa = await env.DB
    .prepare("SELECT id, no_absen, nama, kelas, nis, nisn, jk FROM siswa WHERE id = ?")
    .bind(siswa_id)
    .first();

  if (!siswa) {
    return new Response(JSON.stringify({ error: "Siswa tidak ditemukan" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const mapel = await env.DB
    .prepare("SELECT id, nama FROM mapel WHERE id = ?")
    .bind(mapel_id)
    .first();

  if (!mapel) {
    return new Response(JSON.stringify({ error: "Mapel tidak ditemukan" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await env.DB
    .prepare(
      `INSERT INTO ujian_siswa (siswa_id, mapel_id, waktu_mulai)
       VALUES (?, ?, datetime('now'))`
    )
    .bind(siswa_id, mapel_id)
    .run();

  return new Response(
    JSON.stringify({
      ujian_siswa_id: res.lastRowId,
      siswa,
      mapel,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
