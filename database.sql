CREATE DATABASE IF NOT EXISTS payroll_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE payroll_db;

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'admin', employee_id INT UNIQUE,
  two_factor_secret VARCHAR(128), two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY, department_id VARCHAR(24) NOT NULL UNIQUE,
  department_name VARCHAR(100) NOT NULL UNIQUE, description TEXT, manager_name VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY, employee_id VARCHAR(24) NOT NULL UNIQUE,
  full_name VARCHAR(140) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, phone VARCHAR(30),
  gender VARCHAR(30), date_of_birth DATE, department_id INT, designation VARCHAR(100), joining_date DATE,
  address TEXT, bank_account_number VARCHAR(64), ifsc_code VARCHAR(24), pan_number VARCHAR(24),
  employment_status ENUM('Active','On Leave','Inactive') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL, INDEX idx_employee_name(full_name)
);
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT NOT NULL, attendance_date DATE NOT NULL,
  status ENUM('Present','Absent','Paid Leave','Unpaid Leave') NOT NULL,
  overtime_hours DECIMAL(7,2) NOT NULL DEFAULT 0, notes VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_day(employee_id, attendance_date), FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS salary_structures (
  id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT NOT NULL UNIQUE,
  basic_salary DECIMAL(12,2) NOT NULL DEFAULT 0, hra DECIMAL(12,2) NOT NULL DEFAULT 0,
  allowances DECIMAL(12,2) NOT NULL DEFAULT 0, bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
  overtime_rate DECIMAL(10,2) NOT NULL DEFAULT 0, provident_fund DECIMAL(12,2) NOT NULL DEFAULT 0,
  professional_tax DECIMAL(12,2) NOT NULL DEFAULT 0, income_tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  other_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS payrolls (
  id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT NOT NULL, month TINYINT NOT NULL, year SMALLINT NOT NULL,
  present_days DECIMAL(5,2) DEFAULT 0, unpaid_leave_days DECIMAL(5,2) DEFAULT 0, overtime_hours DECIMAL(7,2) DEFAULT 0,
  gross_salary DECIMAL(12,2) NOT NULL, total_deductions DECIMAL(12,2) NOT NULL, net_salary DECIMAL(12,2) NOT NULL,
  earnings JSON, deductions JSON, status ENUM('Pending','Paid','Cancelled') NOT NULL DEFAULT 'Pending',
  approval_status VARCHAR(20) NOT NULL DEFAULT 'Pending', approved_by INT, approved_at DATETIME, approval_note VARCHAR(500),
  payment_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll_period(employee_id, month, year), INDEX idx_payroll_status_period(status, year, month),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS payslips (
  id INT AUTO_INCREMENT PRIMARY KEY, payroll_id INT NOT NULL UNIQUE, pdf_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (payroll_id) REFERENCES payrolls(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY, admin_id INT, action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80), entity_id INT, details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
  leave_type ENUM('Paid','Unpaid','Sick','Personal') NOT NULL, reason VARCHAR(1000),
  status VARCHAR(20) NOT NULL DEFAULT 'Pending', reviewed_by INT, reviewed_at DATETIME, reviewer_note VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leave_employee_status(employee_id,status), FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS salary_revisions (
  id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT NOT NULL, effective_date DATE NOT NULL, reason VARCHAR(500), snapshot JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_salary_revision(employee_id,effective_date), FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY, admin_id INT NOT NULL, title VARCHAR(160) NOT NULL, message VARCHAR(1000) NOT NULL,
  category VARCHAR(40) DEFAULT 'general', read_at DATETIME, link VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_notification_admin_read(admin_id,read_at), FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS company_settings (
  id INT AUTO_INCREMENT PRIMARY KEY, `key` VARCHAR(80) NOT NULL UNIQUE, value JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO departments (department_id, department_name, description, manager_name) VALUES
('DEP-001','Engineering','Product engineering and platform','Olivia Martin'),
('DEP-002','People','People operations','Daniel Kim'),
('DEP-003','Finance','Finance and accounting','Amara Okafor'),
('DEP-004','Design','Product design','Lucas Chen');
INSERT IGNORE INTO employees (employee_id,full_name,email,phone,gender,department_id,designation,joining_date,employment_status) VALUES
('EMP-1001','Ava Patel','ava.patel@example.com','+1 415 555 0101','Female',1,'Senior Engineer','2022-04-18','Active'),
('EMP-1002','Noah Williams','noah.williams@example.com','+1 415 555 0102','Male',2,'People Partner','2023-01-09','Active'),
('EMP-1003','Mia Chen','mia.chen@example.com','+1 415 555 0103','Female',3,'Financial Analyst','2021-08-23','Active'),
('EMP-1004','Ethan Brooks','ethan.brooks@example.com','+1 415 555 0104','Male',1,'Product Manager','2024-02-12','Active'),
('EMP-1005','Isabella Garcia','isabella.garcia@example.com','+1 415 555 0105','Female',4,'UX Designer','2022-11-07','Active');
INSERT IGNORE INTO salary_structures (employee_id,basic_salary,hra,allowances,bonus,overtime_rate,provident_fund,professional_tax,income_tax,other_deductions) VALUES
(1,7200,1200,400,300,45,500,80,720,0),(2,5900,1000,350,200,35,420,80,510,0),(3,6400,1100,300,250,40,450,80,580,25),(4,8100,1400,500,400,50,600,80,900,0),(5,6200,1050,350,250,38,440,80,540,0);
INSERT IGNORE INTO payrolls (employee_id,month,year,present_days,unpaid_leave_days,overtime_hours,gross_salary,total_deductions,net_salary,earnings,deductions,status,payment_date) VALUES
(1,8,2026,22,0,3,9240,1300,7940,'{"basic":7200,"hra":1200,"allowances":400,"bonus":300,"overtime":140}','{"provident_fund":500,"professional_tax":80,"income_tax":720}', 'Paid','2026-08-31'),
(2,8,2026,21,1,0,7450,1126.82,6323.18,'{"basic":5900,"hra":1000,"allowances":350,"bonus":200,"overtime":0}','{"provident_fund":420,"professional_tax":80,"income_tax":510,"unpaid_leave":116.82}', 'Paid','2026-08-31'),
(3,8,2026,22,0,2,8130,1135,6995,'{"basic":6400,"hra":1100,"allowances":300,"bonus":250,"overtime":80}','{"provident_fund":450,"professional_tax":80,"income_tax":580,"other":25}', 'Paid','2026-08-31'),
(4,9,2026,22,0,4,10400,1580,8820,'{"basic":8100,"hra":1400,"allowances":500,"bonus":400,"overtime":200}','{"provident_fund":600,"professional_tax":80,"income_tax":900}', 'Pending',NULL),
(5,9,2026,20,2,1,7888,1308.18,6579.82,'{"basic":6200,"hra":1050,"allowances":350,"bonus":250,"overtime":38}','{"provident_fund":440,"professional_tax":80,"income_tax":540,"unpaid_leave":248.18}', 'Pending',NULL);
UPDATE payrolls SET approval_status = 'Approved' WHERE status = 'Paid';
