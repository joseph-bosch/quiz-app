// Updated App.js
import React, { useState, useEffect } from "react";
import { supabase } from './supabaseClient';
import * as XLSX from "xlsx";
import "./App.css";
import jsPDF from "jspdf";

// const QUESTIONS_URL = `${process.env.PUBLIC_URL}/questions.json`;
const QUESTIONS_URL = "/questions.json";

const PASS_MARK = 10;
const ADMIN_NAMES = ["joseph-admin", "queenie-admin"];

function App() {
  const [welcomeComplete, setWelcomeComplete] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  // const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [showCertImage, setShowCertImage] = useState(false);
  const [lastName, setLastName] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [started, setStarted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [allHistory, setAllHistory] = useState([]);
  const [insertError, setInsertError] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const name = `${firstName.trim()} ${lastName.trim()}`.trim();
  const thStyle = {
    padding: "0.75rem",
    borderBottom: "1px solid #ccc",
    textAlign: "left",
  };

  const tdStyle = {
    padding: "0.75rem",
    borderBottom: "1px solid #eee",
  };

  const loadShuffledQuestions = () => {
    fetch(QUESTIONS_URL)
      .then((res) => res.json())
      .then((data) => {
        const shuffled = data.sort(() => 0.5 - Math.random()).slice(0, 10);
        const questionsWithShuffledOptions = shuffled.map(q => ({
          ...q,
          options: [...q.options].sort(() => 0.5 - Math.random())
        }));
        setQuestions(questionsWithShuffledOptions);
        setAnswers({});
        setScore(0);
        setCurrentIndex(0);
        setSubmitted(false);
        setInsertError(null);
      });
  };


  useEffect(() => {
    if (started) {
      loadShuffledQuestions();
    }
  }, [started]);

  useEffect(() => {
    if (showHistory) {
      supabase
        .from("scores")
        .select("*")
        .order("timestamp", { ascending: false })
        .then(({ data, error }) => {
          if (error) console.error("History fetch error:", error.message);
          else setAllHistory(data);
        });
    }
  }, [showHistory]);

  // Helper: Check if selected answers are correct
  const isAnswerCorrect = (question, selected) => {
    if (Array.isArray(question.correct)) {
      if (!Array.isArray(selected)) return false;
      // Exact match (order independent)
      const sortedSelected = [...selected].sort();
      const sortedCorrect = [...question.correct].sort();
      return JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect);
    } else {
      return selected === question.correct;
    }
  };

  // Updated handleSelect to handle single and multiple choice questions
  const handleSelect = (option) => {
    const currentQuestion = questions[currentIndex];
    const isMultiple = Array.isArray(currentQuestion.correct);

    if (isMultiple) {
      const selected = answers[currentIndex] || [];
      let newSelected;
      if (selected.includes(option)) {
        // Deselect option
        newSelected = selected.filter((item) => item !== option);
      } else {
        // Select option
        newSelected = [...selected, option];
      }
      setAnswers({ ...answers, [currentIndex]: newSelected });
    } else {
      // Single selection — select and move to next question after short delay
      setAnswers({ ...answers, [currentIndex]: option });
      setTimeout(() => {
        if (currentIndex < questions.length - 1) {
          setCurrentIndex(currentIndex + 1);
        }
      }, 300);
    }
  };


  // Updated handleSubmit to use isAnswerCorrect
  const handleSubmit = async () => {
    const finalScore = questions.reduce(
      (acc, q, i) => acc + (isAnswerCorrect(q, answers[i]) ? 1 : 0),
      0
    );
    setScore(finalScore);
    setSubmitted(true);
    const passed = (finalScore / questions.length) * 100 >= PASS_MARK;

    const { error } = await supabase.from("scores").insert([
      {
        name: name.trim(),
        score: finalScore,
        total: questions.length,
        pass: passed,
        emp_num: employeeNo,
      },
    ]);

    setInsertError(error ? error.message : null);
  };

  const resetQuiz = () => {
    setQuestions([]);
    setAnswers({});
    setScore(0);
    setCurrentIndex(0);
    setSubmitted(false);
    setStarted(false);
    setInsertError(null);
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(allHistory.map(row => ({
      Name: row.name,
      "Employee No": row.employee_no || '',
      Score: row.score,
      Total: row.total,
      Result: row.pass ? "Pass" : "Fail",
      Time: new Date(row.timestamp).toLocaleString(),
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "QuizHistory");
    XLSX.writeFile(workbook, "Quiz_History.xlsx");
  };

  if (!welcomeComplete && !showHistory) {
    return (
      <div
        className="quiz-screen"
        style={{
          background: `url('/images/quiz.png') no-repeat center center / cover`,
          minHeight: '100vh'
        }}
      >
        <div className="start-content" style={{
          color: 'black'
        }}>
          <h1>Hi👋，欢迎来到测验时间！</h1>
          <p>
            恭喜您完成培训课程！接下来的测验是帮助您复习刚才的重点，也是获得证书的最后一步啦！
            <br />
            • 测验题数：10 题
            <br />
            • 轻松作答就好～
            <br />
            别紧张，放轻松，您一定可以顺利完成！
            <br />
            准备好了吗？Let’s go 🚀🚀🚀
          </p>
          <button onClick={() => setWelcomeComplete(true)}>Start</button>
        </div>
      </div>
    );
  }

  if (!started && !showHistory) {
    return (
      <div
        className="quiz-screen"
        style={{
          // background: `url('${process.env.PUBLIC_URL}/images/quiz.png') no-repeat center center / cover`,
          background: `url('/images/quiz.png') no-repeat center center / cover`,
          minHeight: '100vh'
        }}
      >
        <div className="start-content">
          <h1 style={{ color: 'black' }}>🎓 请输入员工号和名字</h1>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="姓"
          style={{width: "250px"}} />
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="名"
            style={{width: "250px"}} 
          />
          <input
            type="text"
            value={employeeNo}
            onChange={(e) => setEmployeeNo(e.target.value)}
            placeholder="工号"
            style={{width: "250px"}} 
          /><br></br>
          <button
            onClick={() =>
              firstName.trim() && lastName.trim() && employeeNo.trim() && setStarted(true)
            }
          >
            开始测验
          </button>
          {ADMIN_NAMES.includes(firstName.trim().toLowerCase()) && (
            <button onClick={() => setShowHistory(true)}>查看记录</button>
          )}
        </div>
      </div>
    );
  }


  if (showHistory) {
    const totalPages = Math.ceil(allHistory.length / ITEMS_PER_PAGE);
    const startIndex = (historyPage - 1) * ITEMS_PER_PAGE;
    const pagedHistory = allHistory.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
      <div style={{
        maxWidth: 800,
        margin: "2rem auto",
        padding: "2rem",
        border: "1px solid #ccc",
        borderRadius: "10px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        fontFamily: "Segoe UI, sans-serif"
      }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          📜 All User Quiz History
        </h2>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
          <button
            onClick={() => setShowHistory(false)}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#eee",
              border: "1px solid #ccc",
              borderRadius: "5px",
              cursor: "pointer"
            }}
          >
            🔙 Back to Start
          </button>
          <button
            onClick={exportToExcel}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#4CAF50",
              color: "#fff",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer"
            }}
          >
            📤 Export Results
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.95rem"
          }}>
            <thead>
              <tr style={{ backgroundColor: "#f2f2f2" }}>
                <th style={thStyle}>Employee Number</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Result</th>
                <th style={thStyle}>Time</th>
              </tr>
            </thead>
            <tbody>
              {pagedHistory.map((h, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                  <td style={tdStyle}>{h.emp_num}</td>
                  <td style={tdStyle}>{h.name}</td>
                  <td style={tdStyle}>{h.score}</td>
                  <td style={tdStyle}>{h.total}</td>
                  <td style={{ ...tdStyle, fontWeight: "bold", color: h.pass ? "green" : "red" }}>
                    {h.pass ? "✅ Pass" : "❌ Fail"}
                  </td>
                  <td style={tdStyle}>{new Date(h.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <button
            disabled={historyPage === 1}
            onClick={() => setHistoryPage((p) => Math.max(p - 1, 1))}
            style={{
              padding: "0.4rem 1rem",
              backgroundColor: historyPage === 1 ? '#aaa' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: historyPage === 1 ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.3s ease'
            }}
          >
            Previous
          </button>
          <span style={{ fontWeight: 'bold' }}>
            Page {historyPage} of {totalPages}
          </span>
          <button
            disabled={historyPage === totalPages}
            onClick={() => setHistoryPage((p) => Math.min(p + 1, totalPages))}
            style={{
              padding: "0.4rem 1rem",
              backgroundColor: historyPage === totalPages ? '#aaa' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: historyPage === totalPages ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.3s ease'
            }}
          >
            Next
          </button>
        </div>
      </div>
    );
  }


  if (submitted) {
    const percentage = (score / questions.length) * 100;
    const passed = percentage >= PASS_MARK;
    const wrongAnswers = questions.filter((q, i) => !isAnswerCorrect(q, answers[i]));

    return (
      <div className="result-screen">
        {/* Top Toolbar */}
        
        {passed && (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <button className="submit-button" onClick={() => setShowCertImage(true)}>🖼️ 查看证书</button>
          <button className="submit-button" onClick={() => generateCertificate(name, score, questions.length)}>📄 下载证书</button>
          
        </div>
        )}

        {showCertImage && (
          <div className="certificate-modal">
            <div className="certificate-content">
              <span className="close-button" onClick={() => setShowCertImage(false)}>×</span>
              <div style={{ position: 'relative' }}>
                <img src="/images/certCompleted.jpg" alt="Certificate" />
                <div className="certificate-overlay-text">
                  <p>This is to certify that</p>
                  <h2 style={{ fontWeight: "bold" }}>{name}</h2>
                  <p>has successfully completed the MA Strategy quiz.</p>
                  <p>Score: {percentage.toFixed(0)}% </p>
                  <p>Date: {new Date().toLocaleDateString()}</p>
                  <p>Bosch Automotive Products (Shenzhen) </p>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Certificate Image */}
        {showCertImage && (
          <div style={{ textAlign: 'center' }}>
            <img src="/images/certCompleted.jpg" alt="Certificate" style={{ maxWidth: '100%' }} />
          </div>
        )}
        <h2>📊 测验结果</h2>
        <p>你的分数: {score} / {questions.length} ({percentage.toFixed(0)}%)</p>
        <p style={{ color: passed ? "green" : "red", fontWeight: "bold", fontSize: "1.5rem" }}>
          {passed
            ? "🎉 恭喜完成測驗！您的努力值得肯定 👏"
            : "这次分数还差一点点！别灰心～再挑战一次就有机会通过啰！请重新扫码并完成测验，加油！💪"}
        </p>
        {insertError && <p style={{ color: "red" }}>❌ Error saving score: {insertError}</p>}

        {wrongAnswers.length > 0 && (
          <div className="review-section">
            <h3>🧐 错误答案的复习:</h3>
            <ul>
              {wrongAnswers.map((q, i) => (
                <li key={i} style={{ marginBottom: '1rem' }}>
                  <strong>Q:</strong> {q.question}<br />
                  <strong>您的答案:</strong> {Array.isArray(answers[questions.indexOf(q)]) ? answers[questions.indexOf(q)].join(", ") : (answers[questions.indexOf(q)] || 'Not Answered')}<br />
                  <strong>正确答案:</strong> {Array.isArray(q.correct) ? q.correct.join(", ") : q.correct}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button className="submit-button" onClick={() => {
          setStarted(true);
          loadShuffledQuestions();
        }}>🔁 再挑战</button>
       

        <button className="submit-button" style={{ backgroundColor: '#dc3545' }} onClick={resetQuiz}>⏹ 结束</button>
      </div>
    );
  }

  if (!questions.length || !questions[currentIndex]) {
    return <div className="quiz-screen"><p>Loading quiz...</p></div>;
  }

  const currentQuestion = questions[currentIndex];
  const isMultiple = Array.isArray(questions[currentIndex].correct);

  const selectedAnswers = isMultiple ? (answers[currentIndex] || []) : answers[currentIndex];


  return (
  <div
    className="quiz-screen"
    style={{
      // background: `url('${process.env.PUBLIC_URL}/images/quizTime.jpg') no-repeat center center / cover`,
      background: `url('/images/quizTime.jpg') no-repeat center center / cover`,
      minHeight: '100vh',
    }}
  >
    <div className="quiz-header">
      <h2>Question {currentIndex + 1} of {questions.length}</h2>
      <button onClick={resetQuiz}>❌ 停止</button>
    </div>

    <div className="progress-bar">
      <div className="progress-fill" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}></div>
    </div>

    <div className="quiz-question animate">
      <p><strong style={{ fontSize: '25px' }}>{currentQuestion.question}</strong></p>

      {isMultiple && (
        <p style={{ fontStyle: 'italic', color: 'white', marginBottom: '10px', fontSize:'15px' }}>
          (选择所有适用的选项)
        </p>
      )}

      {currentQuestion.options.map((opt, idx) => {
        const selected = isMultiple
          ? selectedAnswers.includes(opt)
          : selectedAnswers === opt;

        return (
          <button
            key={idx}
            onClick={() => handleSelect(opt)}
            className={`option-button ${selected ? "selected" : ""}`}
            style={{ userSelect: "none" }}
          >
            {opt}
          </button>
        );
      })}
    </div>

    {/* For multiple selection, show Next button except last question */}
    {isMultiple && currentIndex < questions.length - 1 && (
      <button
        className="submit-button"
        style={{ marginTop: '15px' }}
        onClick={() => setCurrentIndex(currentIndex + 1)}
        disabled={(answers[currentIndex]?.length ?? 0) === 0} // disable if no answer
      >
        下一页
      </button>
    )}

    {/* Show Submit button on last question */}
    {(currentIndex === questions.length - 1) && (
      <button
        onClick={handleSubmit}
        className="submit-button"
        style={{ marginTop: '15px' }}
        disabled={
          isMultiple
            ? (answers[currentIndex]?.length ?? 0) === 0
            : !answers[currentIndex]
        }
      >
        提交测验
      </button>
    )}
  </div>
);

}



const generateCertificate = async (name, score, total) => {
  const doc = new jsPDF({
    orientation: "landscape",     // Better certificate layout
    unit: "pt",
    format: [842, 595]            // A4 landscape size in points (≈ 11.69 × 8.27 in)
  });
  const percentage = (score * 10);

  // Load background image
  const img = new Image();
  img.src = "/images/certCompleted.jpg";

  img.onload = () => {
    doc.addImage(img, "JPEG", 0, 0, 842, 595); // Fit to full canvas

    const centerX = 842 / 2;
    const date = new Date().toLocaleDateString();

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(20);
    doc.text("This is to certify that", centerX, 260, { align: "center" });

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(32);
    doc.text(name, centerX, 300, { align: "center" });

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(20);
    doc.text("has successfully completed the MA Strategy quiz.", centerX, 340, { align: "center" });

    doc.setFontSize(18);
    doc.text(`Score: ${percentage.toFixed(0)}%`, centerX, 380, { align: "center" });
    doc.text(`Date: ${date}`, centerX, 410, { align: "center" });

    doc.setFontSize(16);
    doc.text("Bosch Automotive Products (Shenzhen)", centerX, 470, { align: "center" });

    doc.save(`Certificate-${name}.pdf`);
  };

  img.onerror = (e) => {
    console.error("Failed to load certificate background image", e);
  };
};




export default App;
