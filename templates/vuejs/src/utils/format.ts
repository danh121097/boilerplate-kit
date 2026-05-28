import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export function formatDate(date: string | number | Date, pattern = "YYYY-MM-DD"): string {
  return dayjs(date).format(pattern);
}

export function fromNow(date: string | number | Date): string {
  return dayjs(date).fromNow();
}
