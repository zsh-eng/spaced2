import NavButton from "@/components/nav/nav-button";
import { cn, isEventTargetInput } from "@/lib/utils";
import { Book, Bookmark, Home, Plus, UserRound } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

export default function NavBar() {
  const path = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command + 1, 2, 3 ,4, 5
      if (!e.shiftKey) return;
      if (isEventTargetInput(e)) return;
      if (e.key == "!") {
        navigate("/decks");
        return;
      }
      if (e.key == "@") {
        navigate("/saved");
        return;
      }
      if (e.key == "#") {
        navigate("/");
        return;
      }
      if (e.key == "$") {
        navigate("/create");
        return;
      }
      if (e.key == "%") {
        navigate("/profile");
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <div
      className={cn(
        "fixed bottom-0 full flex z-10 bg-muted dark:bg-background w-full pb-[env(safe-area-inset-bottom)]",
        "md:left-4 md:h-full md:flex-col md:justify-center md:w-16 md:pb-0 -mx-2",
      )}
    >
      <NavButton
        icon={<Book />}
        href={"/decks"}
        focused={path.pathname === "/decks"}
      />

      {/* Bookmarks */}
      <NavButton
        icon={<Bookmark />}
        href={"/saved"}
        focused={path.pathname === "/saved"}
      />

      <NavButton
        icon={<Home className={cn("scale-x-110")} strokeWidth={2.5} />}
        href={"/"}
        focused={path.pathname === "/"}
      />

      <NavButton
        icon={<Plus strokeWidth={3} />}
        href={"/create"}
        focused={path.pathname === "/create"}
      />

      {/* Settings */}
      <NavButton
        icon={<UserRound />}
        href={"/profile"}
        focused={path.pathname === "/profile"}
      />
    </div>
  );
}
