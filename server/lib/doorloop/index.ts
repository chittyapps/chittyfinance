import {
  listProperties,
  listLeases,
  listPayments
} from "../../integrations/doorloopClient.js";

const key = process.env.DOORLOOP_API_KEY!;

export async function dlGetProperties() {
  return listProperties(key);
}
export async function dlGetLeases() {
  return listLeases(key);
}
export async function dlGetPayments() {
  return listPayments(key);
}
