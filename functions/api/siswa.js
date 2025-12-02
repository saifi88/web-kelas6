export async function onRequestGet(context) {
  const { env } = context;

  try {
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
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Query siswa gagal",
        message: String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
