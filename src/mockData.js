// src/mockData.js

export const initialMembers = [
  {
    id: 1,
    auth_id: "demo-admin-id", // Matches the mock session ID
    name: "Jane Muthoni Kamau",
    phone: "0712345678",
    email: "jane.muthoni@example.com",
    id_number: "28374659",
    role: "admin",
    join_date: "2023-01-15",
    next_of_kin: "John Kamau",
    nok_phone: "0723456789",
    avatar: "JM",
    enrolled_by: 1
  },
  {
    id: 2,
    auth_id: "demo-chairman-id",
    name: "David Ochieng",
    phone: "0721112233",
    email: "david.ochieng@example.com",
    id_number: "22334455",
    role: "chairman",
    join_date: "2023-01-15",
    next_of_kin: "Mary Ochieng",
    nok_phone: "0733445566",
    avatar: "DO",
    enrolled_by: 1
  },
  {
    id: 3,
    auth_id: "demo-treasurer-id",
    name: "Sarah Wanjiku",
    phone: "0734556677",
    email: "sarah.wanjiku@example.com",
    id_number: "33445566",
    role: "treasurer",
    join_date: "2023-02-10",
    next_of_kin: "Peter Wanjiku",
    nok_phone: "0745667788",
    avatar: "SW",
    enrolled_by: 1
  },
  {
    id: 4,
    auth_id: "demo-member-id",
    name: "Michael Kiprono",
    phone: "0799887766",
    email: "michael.kip@example.com",
    id_number: "11223344",
    role: "member",
    join_date: "2023-06-20",
    next_of_kin: "Alice Kiprono",
    nok_phone: "0788776655",
    avatar: "MK",
    enrolled_by: 2
  },
];

export const initialContributions = [
  { member_id: 1, month: "Jan", year: 2024, amount: 2000 },
  { member_id: 1, month: "Feb", year: 2024, amount: 2000 },
  { member_id: 1, month: "Mar", year: 2024, amount: 2000 },
  
  { member_id: 2, month: "Jan", year: 2024, amount: 2000 },
  { member_id: 2, month: "Feb", year: 2024, amount: 1500 }, // Partial
  
  { member_id: 3, month: "Jan", year: 2024, amount: 2000 },
  { member_id: 3, month: "Feb", year: 2024, amount: 2000 },
  { member_id: 3, month: "Mar", year: 2024, amount: 2000 },
  
  { member_id: 4, month: "Jan", year: 2024, amount: 2000 }, // Full
  // Feb missed
];

export const initialLoans = [
  {
    id: 101,
    member_id: 4,
    amount: 15000,
    purpose: "School Fees",
    status: "active",
    interest_rate: 0.10,
    paid: 3000,
    date: "2024-01-10",
    due_date: "2024-04-10",
    approved_by: 2 // Chairman DO
  },
  {
    id: 102,
    member_id: 2,
    amount: 5000,
    purpose: "Business Stock",
    status: "completed",
    interest_rate: 0.10,
    paid: 5500, // repaid with interest
    date: "2023-10-05",
    due_date: "2023-11-05",
    approved_by: 1
  },
  {
    id: 103,
    member_id: 3,
    amount: 8000,
    purpose: "Medical",
    status: "pending",
    interest_rate: 0.10,
    paid: 0,
    date: "2024-03-01",
    due_date: "2024-06-01"
  }
];
