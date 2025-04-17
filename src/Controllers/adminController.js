const pool = require("../db/db");   // mysql2/promise pool

/* Helpers */
const firstRow = (rows) => rows[0] || {};

exports.getStats = async (_, res) => {
  try {
    const [[{ totalUsers     }]] = await pool.query(`SELECT COUNT(*) AS totalUsers FROM users`);
    const [[{ activeStudents }]] = await pool.query(`
        SELECT COUNT(DISTINCT student_id) activeStudents
        FROM   enrollments
        WHERE  enrolled_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
    const [[{ activeTutors   }]] = await pool.query(`
        SELECT COUNT(*) activeTutors
        FROM   tutors
        WHERE  id IN (SELECT DISTINCT tutor_id FROM courses)`);

    // 🔧 Convert revenue to number safely (null fallback to 0)
    const [[{ revenue }]] = await pool.query(`
        SELECT COALESCE(SUM(c.price * 0.15), 0) AS revenue
        FROM   enrollments e
        JOIN   courses      c ON c.id = e.course_id
    `);

    res.json({
      totalUsers,
      activeUsers: activeStudents + activeTutors,
      activeSessions: 0,
      countriesReached: 0,
      revenue: Number(revenue).toFixed(2) // ✅ Fix: safely format as number
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getUsers = async (_, res) => {
  const [rows] = await pool.query(`
      SELECT u.id,
             CONCAT(first_name,' ',last_name)   AS name,
             email,
             user_type                          AS role
      FROM   users u
      ORDER BY created_at DESC`);
  res.json(rows);
};

exports.updateUser = async (req, res) => {
  const { first_name, last_name, email, user_type } = req.body;
  await pool.query(`UPDATE users SET first_name=?,last_name=?,email=?,user_type=?
                    WHERE id=?`, [first_name,last_name,email,user_type,req.params.id]);
  res.json({ message:"User updated" });
};

exports.deleteUser = async (req, res) => {
  await pool.query(`DELETE FROM users WHERE id=?`, [req.params.id]);
  res.json({ message:"User deleted" });
};

/* ─────  Tutors waiting for approval  ───── */
exports.getPendingTutors = async (_, res) => {
  const [rows] = await pool.query(`
      SELECT t.id,
             CONCAT(u.first_name,' ',u.last_name) AS name
      FROM tutors t JOIN users u ON u.id = t.user_id
      WHERE t.status='pending'`);
  res.json(rows);
};

exports.acceptTutor  = async (req,res)=>changeTutorStatus(req,res,'approved');
exports.declineTutor = async (req,res)=>changeTutorStatus(req,res,'declined');

async function changeTutorStatus(req,res,status){
  await pool.query(`UPDATE tutors SET status=? WHERE id=?`,[status,req.params.id]);
  res.json({message:`Tutor ${status}`});
}
