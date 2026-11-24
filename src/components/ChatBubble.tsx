"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { MessageCircle, ChevronDown } from "lucide-react";
import styles from "./StoreChat.module.css";

const StoreChat = dynamic(() => import("./StoreChat").then(module => module.StoreChat));

export function ChatBubble(props: { userId: string | null; stagingKeyAvailable: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(pathname === "/chat");
  const [visited, setVisited] = useState(open);
  const launcher = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  return <div className={styles.widget} onKeyDown={event => {
    if (open && event.key === "Escape") close();
  }}>
    <button ref={launcher} type="button" className={styles.launcher} aria-expanded={open}
      aria-controls="shopping-assistant" aria-label={open ? "Minimize shopping chat" : "Open shopping chat"}
      onClick={() => { setVisited(true); setOpen(!open); }}>
      {open ? <ChevronDown /> : <MessageCircle />}
    </button>
    <section id="shopping-assistant" className={styles.drawer} hidden={!open} aria-label="ThreadCore shopping assistant">
      {visited && <StoreChat {...props} />}
    </section>
  </div>;
}
