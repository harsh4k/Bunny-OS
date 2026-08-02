"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { asset } from "@/lib/base-path";

const ease = [0.22, 1, 0.36, 1] as const;

export interface MenuItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface FloatingMenuProps {
  items?: MenuItem[];
}

function MenuButton({
  label,
  onClick,
  href,
  isOpen,
  index,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  isOpen: boolean;
  index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const animatingRef = useRef(false);
  const pendingLeaveRef = useRef(false);
  const chars = label.split("");
  const lockDuration = 30 * chars.length + 300;

  const handleEnter = useCallback(() => {
    pendingLeaveRef.current = false;
    if (hovered) return;
    setHovered(true);
    animatingRef.current = true;
    setTimeout(() => {
      animatingRef.current = false;
      if (pendingLeaveRef.current) {
        pendingLeaveRef.current = false;
        setHovered(false);
      }
    }, lockDuration);
  }, [hovered, lockDuration]);

  const handleLeave = useCallback(() => {
    if (animatingRef.current) {
      pendingLeaveRef.current = true;
    } else {
      setHovered(false);
    }
  }, []);

  const content = (
    <div className="flex justify-center">
      {chars.map((char, i) => (
        <span
          key={`${char}-${i}`}
          className="inline-block overflow-hidden"
          style={{ height: "1em" }}
        >
          <span
            className="flex flex-col"
            style={{
              transitionProperty: "transform",
              transitionDuration: hovered ? "800ms" : "0ms",
              transitionDelay: hovered ? `${30 * i}ms` : "0ms",
              transform: hovered ? "translateY(-50%)" : "translateY(0%)",
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <span className="block" style={{ height: "1em", lineHeight: "1em" }}>
              {char === " " ? "\u00A0" : char}
            </span>
            <span
              className="block"
              style={{ height: "1em", lineHeight: "1em" }}
              aria-hidden
            >
              {char === " " ? "\u00A0" : char}
            </span>
          </span>
        </span>
      ))}
    </div>
  );

  const className =
    "text-[#f7f1ed] text-[22px] sm:text-[24px] uppercase leading-none overflow-hidden";

  return (
    <motion.div
      className={className}
      style={{
        fontFamily: "var(--font-display), system-ui, sans-serif",
        letterSpacing: "-0.03em",
        height: "1em",
      }}
      animate={{ opacity: isOpen ? 1 : 0 }}
      transition={{
        duration: 0.4,
        delay: isOpen ? 0.4 + 0.08 * index : 0,
        ease,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {href ? (
        <a
          href={href}
          className="block"
          onClick={onClick}
          aria-label={label}
        >
          {content}
        </a>
      ) : (
        <button type="button" onClick={onClick} className="block w-full">
          {content}
        </button>
      )}
    </motion.div>
  );
}

export default function FloatingMenu({ items }: FloatingMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const menuItems: MenuItem[] = items ?? [
    { label: "Home", href: asset("/") },
    { label: "Features", href: `${asset("/")}#features` },
    { label: "Install", href: `${asset("/")}#install` },
    { label: "Privacy", href: asset("/privacy/") },
    { label: "Terms", href: asset("/terms/") },
  ];

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <motion.div
      ref={containerRef}
      className="fixed bottom-8 left-1/2 z-[100] sm:bottom-10"
      style={{ x: "-50%", pointerEvents: "auto" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
    >
      <motion.div
        className="relative flex flex-col overflow-hidden"
        onClick={() => {
          if (!isOpen) setIsOpen(true);
        }}
        style={{
          letterSpacing: "-0.02em",
          cursor: isOpen ? "default" : "pointer",
        }}
        animate={{
          width: isOpen ? 280 : 150,
          height: isOpen ? 300 : 48,
          borderRadius: isOpen ? 32 : 72,
          scale: 1,
        }}
        whileHover={isOpen ? undefined : { scale: 1.05 }}
        transition={{
          duration: 0.8,
          ease,
          height: { duration: isOpen ? 0.8 : 0.15 },
          scale: { duration: 0.25, ease },
        }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            borderWidth: 1,
            borderStyle: "solid",
            borderRadius: "inherit",
            backgroundColor: "#d4bc94",
            borderColor: "#9a7f56",
          }}
        />

        <motion.div
          className="absolute left-1/2 bg-[#0e0f12]"
          style={{
            width: "200%",
            height: "200%",
            borderRadius: "50%",
            x: "-50%",
          }}
          animate={{ bottom: isOpen ? "-20%" : "-200%" }}
          transition={{
            duration: 0.8,
            ease,
            delay: isOpen ? 0.1 : 0,
          }}
        />

        <div
          className="relative z-10 flex flex-col items-center justify-center gap-5"
          style={{
            pointerEvents: isOpen ? "auto" : "none",
            opacity: isOpen ? 1 : 0,
            flex: isOpen ? 1 : 0,
            overflow: "hidden",
            paddingTop: isOpen ? 20 : 0,
          }}
        >
          {menuItems.map((item, idx) => (
            <MenuButton
              key={item.label}
              label={item.label}
              href={item.href}
              onClick={() => {
                item.onClick?.();
                setIsOpen(false);
              }}
              isOpen={isOpen}
              index={idx}
            />
          ))}
        </div>

        <motion.div
          className="relative z-10 flex w-full shrink-0 cursor-pointer items-center justify-between"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          animate={{
            paddingLeft: isOpen ? 24 : 20,
            paddingRight: isOpen ? 24 : 20,
            paddingBottom: isOpen ? 20 : 0,
            height: 48,
          }}
          transition={{ duration: 0.8, ease }}
        >
          <motion.span
            className="flex items-center gap-2 text-[14px] leading-none md:text-[18px]"
            animate={{ color: isOpen ? "#f7f1ed" : "#0e0f12" }}
            transition={{ duration: 0.3, ease }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/icon.png")}
              alt=""
              width={20}
              height={20}
              className="rounded-md bg-black"
            />
            Menu
          </motion.span>

          <div className="relative flex h-[24px] w-[24px] items-center justify-center">
            <motion.span
              className="absolute block h-[2px] w-[18px] rounded-full"
              animate={{
                rotate: isOpen ? 45 : 0,
                y: isOpen ? 0 : -3,
                backgroundColor: isOpen ? "#f7f1ed" : "#0e0f12",
              }}
              transition={{ duration: 0.4, ease }}
            />
            <motion.span
              className="absolute block h-[2px] w-[18px] rounded-full"
              animate={{
                rotate: isOpen ? -45 : 0,
                y: isOpen ? 0 : 3,
                backgroundColor: isOpen ? "#f7f1ed" : "#0e0f12",
              }}
              transition={{ duration: 0.4, ease }}
            />
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
