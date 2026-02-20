import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// 목적: clsx로 조건부 클래스를 합치고 twMerge로 Tailwind 충돌을 해소한다.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
