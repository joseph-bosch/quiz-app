// Updated App.js
import React, { useState, useEffect } from "react";
import { supabase } from './supabaseClient';
import * as XLSX from "xlsx";
import "./App.css";

const QUESTIONS_URL = `${process.env.PUBLIC_URL}/questions.json`;
// const QUESTIONS_URL = "/questions.json";

const PASS_MARK = 90;
const ADMIN_NAMES = ["joseph", "queenie"];

function App() {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [name, setName] = useState("");
  const [started, setStarted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [allHistory, setAllHistory] = useState([]);
  const [insertError, setInsertError] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

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
      Score: row.score,
      Total: row.total,
      Result: row.pass ? "Pass" : "Fail",
      Time: new Date(row.timestamp).toLocaleString(),
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "QuizHistory");
    XLSX.writeFile(workbook, "Quiz_History.xlsx");
  };

  if (!started && !showHistory) {
    return (
      <div
        className="quiz-screen"
        style={{
          background: `url('${process.env.PUBLIC_URL}/images/quiz.png') no-repeat center center / cover`,
          // background: `url('/images/quiz.png') no-repeat center center / cover`,
          minHeight: '100vh'
        }}
      >
        <div className="start-content">
          <h1 style={{ color:'black' }}>🎓 Welcome to the Quiz</h1>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
          />
          <button onClick={() => name.trim() && setStarted(true)}>Start Quiz</button>
          {ADMIN_NAMES.includes(name.trim().toLowerCase()) && (
            <button onClick={() => setShowHistory(true)}>View History</button>
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
        <h2>📊 Quiz Results</h2>
        <p>Your score: {score} / {questions.length} ({percentage.toFixed(0)}%)</p>
        <p style={{ color: passed ? "green" : "red", fontWeight: "bold", fontSize: "1.5rem" }}>
          {passed ? "🎉 Congratulations, you passed!" : "❌ You did not pass. Try again!"}
        </p>
        {insertError && <p style={{ color: "red" }}>❌ Error saving score: {insertError}</p>}

        {wrongAnswers.length > 0 && (
          <div className="review-section">
            <h3>🧐 Review of Wrong Answers:</h3>
            <ul>
              {wrongAnswers.map((q, i) => (
                <li key={i} style={{ marginBottom: '1rem' }}>
                  <strong>Q:</strong> {q.question}<br />
                  <strong>Your Answer:</strong> {Array.isArray(answers[questions.indexOf(q)]) ? answers[questions.indexOf(q)].join(", ") : (answers[questions.indexOf(q)] || 'Not Answered')}<br />
                  <strong>Correct Answer:</strong> {Array.isArray(q.correct) ? q.correct.join(", ") : q.correct}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button className="submit-button" onClick={() => {
          setStarted(true);
          loadShuffledQuestions();
        }}>🔁 Try Again</button>
        <button className="submit-button" style={{ backgroundColor: '#dc3545' }} onClick={resetQuiz}>⏹ Close Quiz</button>
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
      background: `url('${process.env.PUBLIC_URL}/images/quizTime.jpg') no-repeat center center / cover`,
      // background: `url('/images/quizTime.jpg') no-repeat center center / cover`,
      minHeight: '100vh',
    }}
  >
    <div className="quiz-header">
      <h2>Question {currentIndex + 1} of {questions.length}</h2>
      <button onClick={resetQuiz}>❌ Close Quiz</button>
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
        Next
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
        Submit Quiz
      </button>
    )}
  </div>
);

}

export default App;
