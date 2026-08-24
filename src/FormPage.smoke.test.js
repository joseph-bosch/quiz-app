import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// react-router-dom v7 and supabase-js v2 ship "exports" maps that CRA 5's Jest
// resolver cannot follow, so stub them — this suite only exercises the form UI.
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock(
  "./supabaseClient",
  () => ({ supabase: { storage: { from: () => ({}) }, from: () => ({}) } }),
  { virtual: true }
);

const FormPage = require("./FormPage").default;

const renderPage = () => render(<FormPage />);

beforeEach(() => {
  localStorage.clear();
  if (!global.URL.createObjectURL) global.URL.createObjectURL = jest.fn(() => "blob:mock");
  if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = jest.fn();
});

test("renders all five questions in order", () => {
  renderPage();
  expect(screen.getByText(/1\. 您的姓名/)).toBeInTheDocument();
  expect(screen.getByText(/2\. 您的部门/)).toBeInTheDocument();
  expect(screen.getByText(/3\. 您的工号/)).toBeInTheDocument();
  expect(screen.getByText(/4\. 您建议的小程序名称/)).toBeInTheDocument();
  expect(screen.getByText(/5\. 您建议的小程序头像/)).toBeInTheDocument();
});

test("submit is disabled until every field is filled", () => {
  renderPage();
  const submit = screen.getByRole("button", { name: "提交" });
  expect(submit).toBeDisabled();

  fireEvent.change(screen.getByPlaceholderText("请输入您的姓名"), { target: { value: "张三" } });
  fireEvent.change(screen.getByPlaceholderText("请输入您的工号"), { target: { value: "12345678" } });
  fireEvent.change(screen.getByPlaceholderText("请输入您建议的名称"), { target: { value: "博世小助手" } });
  // department + avatar still missing
  expect(submit).toBeDisabled();
});

test("employee number rejects non-digits and flags short values", () => {
  renderPage();
  const emp = screen.getByPlaceholderText("请输入您的工号");

  fireEvent.change(emp, { target: { value: "abc" } });
  expect(emp.value).toBe(""); // non-digits refused

  fireEvent.change(emp, { target: { value: "123" } });
  expect(screen.getByText(/至少 8 位数字/)).toBeInTheDocument();

  fireEvent.change(emp, { target: { value: "12345678" } });
  expect(screen.queryByText(/至少 8 位数字/)).not.toBeInTheDocument();
});

test("rejects a non-image file and an oversized image", () => {
  renderPage();
  const input = document.querySelector(".form-file-input");

  const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [pdf] } });
  expect(screen.getByText(/请上传图片文件/)).toBeInTheDocument();

  const big = new File(["x"], "big.png", { type: "image/png" });
  Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
  fireEvent.change(input, { target: { files: [big] } });
  expect(screen.getByText(/不能超过 10MB/)).toBeInTheDocument();
});

test("accepts a valid image and shows it as a removable chip", () => {
  renderPage();
  const input = document.querySelector(".form-file-input");

  const img = new File(["x"], "avatar.png", { type: "image/png" });
  Object.defineProperty(img, "size", { value: 2048 });
  fireEvent.change(input, { target: { files: [img] } });

  expect(screen.getByText("avatar.png")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("移除文件"));
  expect(screen.queryByText("avatar.png")).not.toBeInTheDocument();
});

test("accepts a dropped image and validates dropped files too", () => {
  renderPage();
  const zone = screen.getByRole("button", { name: /上传文件/ });

  // a dropped non-image is rejected just like a picked one
  const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });
  fireEvent.drop(zone, { dataTransfer: { files: [pdf] } });
  expect(screen.getByText(/请上传图片文件/)).toBeInTheDocument();

  // a dropped image is accepted
  const img = new File(["x"], "dropped.png", { type: "image/png" });
  Object.defineProperty(img, "size", { value: 4096 });
  fireEvent.drop(zone, { dataTransfer: { files: [img] } });
  expect(screen.getByText("dropped.png")).toBeInTheDocument();
});

test("admin shortcut appears only for admin names", () => {
  renderPage();
  const nameInput = screen.getByPlaceholderText("请输入您的姓名");

  expect(screen.queryByRole("button", { name: /查看提交/ })).not.toBeInTheDocument();

  fireEvent.change(nameInput, { target: { value: "张三" } });
  expect(screen.queryByRole("button", { name: /查看提交/ })).not.toBeInTheDocument();

  fireEvent.change(nameInput, { target: { value: "  Olarinde Joseph  " } }); // case/space tolerant
  expect(screen.getByRole("button", { name: /查看提交/ })).toBeInTheDocument();
});

test("admin shortcut persists the name so the responses page can read it", () => {
  renderPage();
  fireEvent.change(screen.getByPlaceholderText("请输入您的姓名"), {
    target: { value: "Olarinde Joseph" },
  });
  // Nothing is stored until the shortcut is used — this is what broke the page.
  expect(localStorage.getItem("name")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /查看提交/ }));
  expect(localStorage.getItem("name")).toBe("Olarinde Joseph");
});

test("prefills name / department / employee no from localStorage", () => {
  localStorage.setItem("name", "李四");
  localStorage.setItem("employeeNo", "87654321");
  localStorage.setItem("department", "ShzP/QMM");
  renderPage();

  expect(screen.getByPlaceholderText("请输入您的姓名").value).toBe("李四");
  expect(screen.getByPlaceholderText("请输入您的工号").value).toBe("87654321");
  expect(screen.getByText("ShzP/QMM")).toBeInTheDocument(); // react-select shows the value
});
