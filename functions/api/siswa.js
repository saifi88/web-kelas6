export async function onRequestGet(context) {
  const { env } = context;

  const { results } = await env.DB.prepare(
    `SELECT 
       id,
       no_absen,
       nama,
       kelas,
       nis,
       nisn,
       jk
     FROM siswa
     ORDER BY kelas ASC, no_absen ASC`
  ).all();

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
}