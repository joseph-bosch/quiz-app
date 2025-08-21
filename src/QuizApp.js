// QuizApp.js
import React, { useState, useEffect } from "react";
import Select from "react-select";
import { supabase } from "./supabaseClient";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom"; // ✅ using router navigation
// import VoicePage from "./VoicePage"; // ❌ remove (we will route to /audioPage)
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import "./App.css";

const QUESTIONS_URL = "/questions.json";
const PASS_MARK = 90;
const ADMIN_NAMES = ["olarinde joseph", "queenie-admin", "li dongqin"];

const QuizApp = () => {
  const navigate = useNavigate(); // ✅ get navigate
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [name, setName] = useState(localStorage.getItem("name") || "");
  const [department, setDepartment] = useState("");
  const [employeeNo, setEmployeeNo] = useState(localStorage.getItem("employeeNo") || "");
  const [started, setStarted] = useState(false);
  // const [showVoicePage, setShowVoicePage] = useState(false); // ❌ remove
  const [welcomeComplete, setWelcomeComplete] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [employeeError, setEmployeeError] = useState("");
  const [allHistory, setAllHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [loading, setLoading] = useState(false);
  const [insertError, setInsertError] = useState(null);
  const [showCertImage, setShowCertImage] = useState(false);

  const departments = [
    "BD/SLP-CO2", "C/TXR-CN-D4", "GR/FCM-Shz", "GS/OBR23-APAC17", "GS/OSD4-APAC16",
    "GS/PSD5-AP", "MA/HRL-Shz", "MA-WS/PAS-EAA-CN", "MA-WS/PAW-ENG1-CN", "MA-WS/PAW-ENG2-CN",
    "MA-WS/PAW-ENG3-CN", "MA-WS/PAW-ENG-CN", "MA-WS/PUQ1-Shz", "MA-WS/PUQ2-Shz", "MA-WS/PUQ-Shz",
    "MA-WS/PUR2", "ShzP/COR", "ShzP/CTG", "ShzP/HSE", "ShzP/LOG", "ShzP/LOP", "ShzP/LOW", "ShzP/LOW1",
    "ShzP/LOW2", "ShzP/MFE", "ShzP/MFI", "ShzP/MFO1", "ShzP/MFO11", "ShzP/MFO12", "ShzP/MFO13",
    "ShzP/MFO2", "ShzP/MFO21", "ShzP/MFO22", "ShzP/MFO23", "ShzP/MFO24", "ShzP/MFO3", "ShzP/MFO31",
    "ShzP/MFO32", "ShzP/MFO33", "ShzP/MFO4", "ShzP/MFO5", "ShzP/MFO51", "ShzP/MFO52", "ShzP/MFO53",
    "ShzP/MOE", "ShzP/PM", "ShzP/QMM", "ShzP/QMM1", "ShzP/QMM2", "ShzP/QMM6", "ShzP/TEF", "ShzP/TEF1",
    "ShzP/TEF2"
  ].map((dept) => ({ value: dept, label: dept }));

  const isAdmin = ADMIN_NAMES.includes(name.trim().toLowerCase());

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
      fetchAllHistory();
    }
  }, [showHistory]);

  const fetchAllHistory = async () => {
    let allData = [];
    let from = 0;
    const batchSize = 1000;
    let moreData = true;

    while (moreData) {
      const { data, error } = await supabase
        .from("scores")
        .select("*")
        .order("timestamp", { ascending: false })
        .range(from, from + batchSize - 1);

      if (error) {
        console.error("History fetch error:", error.message);
        break;
      }

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += batchSize;
      } else {
        moreData = false; // no more rows
      }
    }

    setAllHistory(allData);
    console.log("✅ Total rows fetched:", allData.length);
  };


  const handleSelect = (option) => {
    const currentQuestion = questions[currentIndex];
    const isMultiple = Array.isArray(currentQuestion.correct);

    if (isMultiple) {
      const selected = answers[currentIndex] || [];
      let newSelected;
      if (selected.includes(option)) {
        newSelected = selected.filter((item) => item !== option);
      } else {
        newSelected = [...selected, option];
      }
      setAnswers({ ...answers, [currentIndex]: newSelected });
    } else {
      setAnswers({ ...answers, [currentIndex]: option });
      setTimeout(() => {
        if (currentIndex < questions.length - 1) {
          setCurrentIndex(currentIndex + 1);
        }
      }, 300);
    }
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(allHistory.map(row => ({
      Name: row.name,
      "Employee No": row.emp_num || '',
      Score: row.score,
      Total: row.total,
      Result: row.pass ? "Pass" : "Fail",
      Time: new Date(row.timestamp).toLocaleString(),
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "QuizHistory");
    XLSX.writeFile(workbook, "Quiz_History.xlsx");
  };

  const isAnswerCorrect = (question, selected) => {
    if (Array.isArray(question.correct)) {
      if (!Array.isArray(selected)) return false;
      const sortedSelected = [...selected].sort();
      const sortedCorrect = [...question.correct].sort();
      return JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect);
    } else {
      return selected === question.correct;
    }
  };

  const handleSubmit = async () => {
    const finalScore = questions.reduce(
      (acc, q, i) => acc + (isAnswerCorrect(q, answers[i]) ? 1 : 0),
      0
    );
    setScore(finalScore);
    setSubmitted(true);
    await supabase.from("scores").insert([
      {
        name: name.trim(),
        emp_num: employeeNo,
        department,
        score: finalScore,
        total: questions.length,
        pass: finalScore / questions.length >= PASS_MARK / 100,
      },
    ]);
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

  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from("scores")
      .select("*")
      .eq("emp_num", employeeNo);
    if (!error && data) setHistoryData(data);
  };

  // ❌ removed inline VoicePage rendering
  // if (showVoicePage) {
  //   return <VoicePage empNum={employeeNo} isAdmin={isAdmin} onBack={() => setShowVoicePage(false)} />;
  // }

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
                <th style={thStyle}>Dept</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Result</th>
                <th style={thStyle}>Time</th>
              </tr>
            </thead>
            <tbody>
              {pagedHistory.map((h, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                  <td style={tdStyle}>{h.emp_num}</td>
                  <td style={tdStyle}>{h.name}</td>
                  <td style={tdStyle}>{h.department}</td>
                  <td style={tdStyle}>{h.score}</td>
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

  if (!welcomeComplete) {
    return (
      <div
        className="quiz-screen"
        style={{
          background: `url('/images/quiz.png') no-repeat center center / cover`,
          minHeight: '100vh'
        }}
      >
        <div className="start-content" style={{ color: 'black' }}>
          <h1>Hi👋，欢迎来到测验时间！</h1>
          <p>
            恭喜您完成培训课程！接下来的测验是帮助您复习刚才的重点，也是获得证书的最后一步啦！<br />
            • 测验题数：10 题<br />• 轻松作答就好～<br />
            别紧张，放轻松，您一定可以顺利完成！<br />准备好了吗？Let’s go 🚀🚀🚀
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
          background: `url('/images/quiz.png') no-repeat center center / cover`,
          minHeight: '100vh'
        }}
      >
        <div className="start-content">
          <h1 style={{ color: 'black' }}>🎓 请输入您的信息</h1>

          <input
            type="text"
            value={employeeNo}
            onChange={(e) => {
              const value = e.target.value;
              if (/^\d*$/.test(value)) {
                setEmployeeNo(value);
                if (value.length < 8) {
                  setEmployeeError("工号必须至少8位数字");
                } else {
                  setEmployeeError("");
                }
              }
            }}
            placeholder="工号"
            style={{ width: "250px" }}
          />

          {employeeError && (
            <p style={{ color: "red", fontSize: "12px", margin: "4px 0 10px 0" }}>{employeeError}</p>
          )}

          <Select
            options={departments}
            value={departments.find((d) => d.value === department)}
            placeholder="选择部门"
            onChange={(selected) => setDepartment(selected ? selected.value : "")}
            styles={{
              container: (base) => ({
                ...base,
                width: "275px",
                borderRadius: "12px",
                color: "black",
                margin: "0 auto",
              }),
              control: (base) => ({
                ...base,
                borderRadius: "8px",
                fontSize: "12px",
                textAlign: "left",
                minHeight: "40px",
                paddingLeft: "5px",
              }),
              placeholder: (base) => ({
                ...base,
                textAlign: "left",
                marginLeft: 0,
              }),
            }}
          />

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="姓名"
            style={{ width: "250px" }}
          />
          <br />

          <button
            onClick={() => {
              // ✅ persist for later routes
              localStorage.setItem("employeeNo", employeeNo);
              localStorage.setItem("name", name);
              setStarted(true);
            }}
            disabled={!department.trim() || !name.trim() || employeeNo.length < 8}
            style={{
              backgroundColor:
                !department.trim() || !name.trim() || employeeNo.length < 8
                  ? "#ccc"
                  : "#4CAF50",
              color: "white",
              padding: "8px 16px",
              border: "none",
              cursor:
                !department.trim() || !name.trim() || employeeNo.length < 8
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            开始测验
          </button>

          {ADMIN_NAMES.includes(name.trim().toLowerCase()) && (
            <button onClick={() => setShowHistory(true)}>查看记录</button>
          )}

          {ADMIN_NAMES.includes(name.trim().toLowerCase()) && employeeNo.length >= 8 && (
            <button
              style={{
                backgroundColor: "#2196f3",
                color: "white",
                padding: "8px 16px",
                border: "none",
                cursor: "pointer",
                marginTop: "10px"
              }}
              onClick={() => {
                // ✅ persist then route to /audioPage
                localStorage.setItem("employeeNo", employeeNo);
                localStorage.setItem("name", name);
                navigate("/audioPage");
              }}
            >
              🎧 听语音
            </button>
          )}
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
        {loading && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(255, 255, 255, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}>
            <img src="/loading.gif" alt="Loading..." style={{ width: '80px', height: '80px' }} />
          </div>
        )}

        {passed && (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '5px' }}>
            <button className="submit-button" onClick={() => setShowCertImage(true)}>🖼️ 查看证书</button>
            <button
              className="submit-button"
              onClick={() => {
                setLoading(true);
                setTimeout(async () => {
                  try {
                    await generateCertificate(name, score, questions.length, department);
                  } finally {
                    setLoading(false);
                  }
                }, 0);
              }}
            >
              📄 下载证书
            </button>
          </div>
        )}

        {showCertImage && (
          <div className="certificate-modal">
            <div className="certificate-content">
              <span className="close-button" onClick={() => setShowCertImage(false)}>×</span>
              <div className="certificate-overlay">
                <img src="/images/certCompleted.jpg" alt="Certificate" className="certificate-image" />
                <div className="certificate-overlay-text">
                  <p>This is to certify that</p>
                  <h2>{name} ({department})</h2>
                  <p>has successfully completed the MA Strategy quiz.</p>
                  <div style={{ justifyContent: "center", gap: "20px", paddingBottom: "0px" }}>
                    <p>Score: {percentage.toFixed(0)}%</p>
                    <p>Date: {new Date().toLocaleDateString()}</p>
                  </div>
                  <p>Bosch Automotive Products (Shenzhen) Co., Ltd.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <h2>📊 测验结果</h2>
        <p>你的分数: {score} / {questions.length} ({percentage.toFixed(0)}%)</p>
        <p style={{ color: passed ? "green" : "red", fontWeight: "bold", fontSize: "1.5rem" }}>
          {passed
            ? "🎉 恭喜完成测验！您的努力值得肯定 👏"
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
          <p style={{ fontStyle: 'italic', color: 'white', marginBottom: '10px', fontSize: '15px' }}>
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

      {isMultiple && currentIndex < questions.length - 1 && (
        <button
          className="submit-button"
          style={{ marginTop: '15px' }}
          onClick={() => setCurrentIndex(currentIndex + 1)}
          disabled={(answers[currentIndex]?.length ?? 0) === 0}
        >
          下一页
        </button>
      )}

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
};

const generateCertificate = async (name, score, total, department) => {
  const bgImageUrl = '/images/certCompleted.jpg';
  const fontUrl = '/SimSun.ttf';

  const [bgImageBytes, fontBytes] = await Promise.all([
    fetch(bgImageUrl).then((res) => res.arrayBuffer()),
    fetch(fontUrl).then((res) => res.arrayBuffer()),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const customFont = await pdfDoc.embedFont(fontBytes);
  const bgImage = await pdfDoc.embedJpg(bgImageBytes);
  const { width, height } = bgImage.scale(1);

  const page = pdfDoc.addPage([width, height]);

  page.drawImage(bgImage, { x: 0, y: 0, width, height });

  const centerX = width / 2;
  const date = new Date().toLocaleDateString();
  const percentage = (score / total) * 100;

  const drawTextWithShadow = (text, x, y, size) => {
    const shadowOffset = 1;
    page.drawText(text, {
      x: x + shadowOffset,
      y: y - shadowOffset,
      size,
      font: customFont,
      color: rgb(0.6, 0.6, 0.6),
    });
    page.drawText(text, {
      x, y, size, font: customFont, color: rgb(0, 0, 0),
    });
  };
  const textName = name + `(${department})`;
  drawTextWithShadow("This is to certify that", centerX - customFont.widthOfTextAtSize("This is to certify that", 24) / 2, height - 280, 24);
  drawTextWithShadow(textName, centerX - customFont.widthOfTextAtSize(textName, 36) / 2, height - 335, 36);
  drawTextWithShadow("has successfully completed the MA Strategy quiz.", centerX - customFont.widthOfTextAtSize("has successfully completed the MA Strategy quiz.", 20) / 2, height - 380, 20);
  drawTextWithShadow(`Score: ${percentage.toFixed(0)}%`, centerX - customFont.widthOfTextAtSize(`Score: ${percentage.toFixed(0)}%`, 18) / 2, height - 460, 18);
  drawTextWithShadow(`Date: ${date}`, centerX - customFont.widthOfTextAtSize(`Date: ${date}`, 18) / 2, height - 420, 18);
  drawTextWithShadow("Bosch Automotive Products (Shenzhen) Co., Ltd.", centerX - customFont.widthOfTextAtSize("Bosch Automotive Products (Shenzhen) Co., Ltd.", 16) / 2, height - 510, 16);

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Certificate-${name}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

export default QuizApp;