export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const mapel_id = url.searchParams.get('mapel_id');

  if (!mapel_id) {
    return new Response("Missing mapel_id", { status: 400 });
  }

  // Query: ambil rekap per pengguna (sama logic seperti SQL di atas)
  const sql = `
  SELECT
    us.id AS ujian_siswa_id,
    s.id AS siswa_id,
    s.nama,
    s.no_absen,
    s.kelas,
    SUM(CASE WHEN upper(j.jawaban) = upper(so.kunci) THEN IFNULL(so.skor,1) ELSE 0 END) AS total_score,
    SUM(IFNULL(so.skor,1)) AS max_score,
    ROUND(100.0 * SUM(CASE WHEN upper(j.jawaban) = upper(so.kunci) THEN IFNULL(so.skor,1) ELSE 0 END) / SUM(IFNULL(so.skor,1)), 2) AS percent_score
  FROM ujian_siswa us
  JOIN siswa s ON s.id = us.siswa_id
  LEFT JOIN jawaban j ON j.ujian_siswa_id = us.id
  LEFT JOIN soal so ON so.id = j.soal_id
  WHERE us.mapel_id = ?
  GROUP BY us.id, s.id, s.nama, s.no_absen, s.kelas
  ORDER BY s.kelas, s.no_absen
  `;

  try {
    const r = await env.DB.prepare(sql).bind(mapel_id).all();
    const rows = r.results || [];

    // build CSV
    const header = ["ujian_siswa_id","siswa_id","nama","no_absen","kelas","total_score","max_score","percent_score"];
    const csvLines = [header.join(",")];

    for (const row of rows) {
      // escape quotes, dan bungkus item yang mengandung koma dengan double quotes
      const vals = header.map(h => {
        let v = row[h] ?? "";
        v = String(v).replace(/"/g, '""');
        if (String(v).includes(",")) return `"${v}"`;
        return v;
      });
      csvLines.push(vals.join(","));
    }

    const csv = csvLines.join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rekap_mapel_${mapel_id}.csv"`
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "query_failed", message: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}