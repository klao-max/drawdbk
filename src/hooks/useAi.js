import { useContext } from "react";
import { AiContext } from "../context/AiContext";

export default function useAi() {
  return useContext(AiContext);
}
