const express = require("express");
const db = require("../db/db");
const { authenticate } = require("../middleware/authMiddleware");
const { ensureTutor } = require("../middleware/authTutor");

const router = express.Router();

router.get("/earnings", authenticate, ensureTutor, async (req, res) => {
  const userId = req.user.id;
  const { period = 'month', startDate, endDate } = req.query;

  try {
    // Get tutor ID
    const [[tutor]] = await db.query("SELECT id FROM tutors WHERE user_id = ?", [userId]);
    const tutorId = tutor?.id;

    // Build date filter
    let dateFilter = '';
    let params = [tutorId];
    
    if (startDate && endDate) {
      dateFilter = 'AND e.enrolled_at BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else {
      switch (period) {
        case 'week':
          dateFilter = 'AND e.enrolled_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
          break;
        case 'month':
          dateFilter = 'AND e.enrolled_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
          break;
        case 'year':
          dateFilter = 'AND e.enrolled_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
          break;
        default:
          dateFilter = 'AND e.enrolled_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
      }
    }

    // Total earnings
    const [[{ total_earned }]] = await db.query(`
      SELECT SUM(c.price) AS total_earned
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE c.tutor_id = ? ${dateFilter}
    `, params);

    // Recent enrollments with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const offset = (page - 1) * limit;

    const [transactions] = await db.query(`
      SELECT 
        e.enrolled_at, 
        c.title AS course_title, 
        c.price, 
        u.first_name, 
        u.last_name
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      JOIN students s ON s.user_id = e.student_id
      JOIN users u ON s.user_id = u.id
      WHERE c.tutor_id = ? ${dateFilter}
      ORDER BY e.enrolled_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    // Get total count for pagination
    const [[{ total_count }]] = await db.query(`
      SELECT COUNT(*) AS total_count
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE c.tutor_id = ? ${dateFilter}
    `, params);

    // Get earnings by course with tax calculations
    const [earningsByCourse] = await db.query(`
      SELECT 
        c.title, 
        COUNT(*) as enrollments, 
        SUM(c.price) as total_earned,
        SUM(c.price * 0.15) as tax_amount,
        SUM(c.price * 0.85) as post_tax_earned
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE c.tutor_id = ? ${dateFilter}
      GROUP BY c.id
      ORDER BY total_earned DESC
    `, params);

    // Calculate totals from the per-course calculations
    const calculatedTotal = earningsByCourse.reduce((sum, course) => sum + Number(course.total_earned), 0);
    const taxAmount = earningsByCourse.reduce((sum, course) => sum + Number(course.tax_amount), 0);
    const postTaxTotal = earningsByCourse.reduce((sum, course) => sum + Number(course.post_tax_earned), 0);

    // Get monthly earnings trend with tax calculations
    const [monthlyTrend] = await db.query(`
      WITH RECURSIVE months AS (
        SELECT 
          DATE_FORMAT(
            CASE 
              WHEN ? = 'week' THEN DATE_SUB(NOW(), INTERVAL 1 WEEK)
              WHEN ? = 'month' THEN DATE_SUB(NOW(), INTERVAL 1 MONTH)
              WHEN ? = 'year' THEN DATE_SUB(NOW(), INTERVAL 1 YEAR)
              ELSE DATE_SUB(NOW(), INTERVAL 1 MONTH)
            END,
            '%Y-%m-01'
          ) as month_date
        UNION ALL
        SELECT DATE_ADD(month_date, INTERVAL 1 MONTH)
        FROM months
        WHERE month_date < DATE_FORMAT(NOW(), '%Y-%m-01')
      )
      SELECT 
        DATE_FORMAT(m.month_date, '%Y-%m') as month,
        COALESCE(SUM(c.price), 0) as earnings,
        COALESCE(SUM(c.price * 0.15), 0) as tax_amount,
        COALESCE(SUM(c.price * 0.85), 0) as post_tax_earnings
      FROM months m
      LEFT JOIN enrollments e ON DATE_FORMAT(e.enrolled_at, '%Y-%m') = DATE_FORMAT(m.month_date, '%Y-%m')
      LEFT JOIN courses c ON e.course_id = c.id AND c.tutor_id = ?
      GROUP BY m.month_date
      ORDER BY m.month_date ASC
    `, [period, period, period, tutorId]);

    res.json({
      total: Number(calculatedTotal) || 0,
      taxAmount,
      postTaxTotal,
      transactions,
      pagination: {
        total: total_count,
        page,
        limit,
        totalPages: Math.ceil(total_count / limit)
      },
      analytics: {
        earningsByCourse: earningsByCourse.map(course => ({
          ...course,
          total_earned: Number(course.total_earned),
          tax_amount: Number(course.tax_amount),
          post_tax_earned: Number(course.post_tax_earned)
        })),
        monthlyTrend: monthlyTrend.map(month => ({
          ...month,
          earnings: Number(month.earnings),
          tax_amount: Number(month.tax_amount),
          post_tax_earnings: Number(month.post_tax_earnings)
        }))
      }
    });
  } catch (err) {
    console.error("Earnings fetch error:", err);
    res.status(500).json({ message: "Failed to fetch earnings." });
  }
});

module.exports = router;
