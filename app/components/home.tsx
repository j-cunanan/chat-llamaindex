"use client";

import React, { useContext, useEffect, useState } from "react";

import { QueryClient, QueryClientProvider } from "react-query";
import { getCSSVar, useMobileScreen } from "../utils";

import dynamic from "next/dynamic";
import { Path } from "../constant";
import { ErrorBoundary } from "./layout/error";

import { getLang } from "../locales";

import { useSession } from "next-auth/react";
import {
  Route,
  HashRouter as Router,
  Routes,
  useNavigate,
} from "react-router-dom";
import { getClientConfig } from "../config/client";
import { useChatStore } from "../store";
import { Bot, useBotStore } from "../store/bot";
import { Theme, useAppConfig } from "../store/config";
import LoginPage from "./login";
import { SideBar } from "./layout/sidebar";
import { LoadingModule } from "@/app/components/ui/loading";

const SettingsPage = dynamic(
  async () => (await import("./settings")).Settings,
  {
    loading: () => <LoadingModule />,
  },
);

const ChatPage = dynamic(async () => (await import("./chat/chat")).Chat, {
  loading: () => <LoadingModule />,
});

export function useSwitchTheme() {
  const config = useAppConfig();

  useEffect(() => {
    document.body.classList.remove("light");
    document.body.classList.remove("dark");

    if (config.theme === Theme.Dark) {
      document.body.classList.add("dark");
    } else if (config.theme === Theme.Light) {
      document.body.classList.add("light");
    }

    const metaDescriptionDark = document.querySelector(
      'meta[name="theme-color"][media*="dark"]',
    );
    const metaDescriptionLight = document.querySelector(
      'meta[name="theme-color"][media*="light"]',
    );

    if (config.theme === "auto") {
      metaDescriptionDark?.setAttribute("content", "#151515");
      metaDescriptionLight?.setAttribute("content", "#fafafa");
    } else {
      const themeColor = getCSSVar("--theme-color");
      metaDescriptionDark?.setAttribute("content", themeColor);
      metaDescriptionLight?.setAttribute("content", themeColor);
    }
  }, [config.theme]);
}

function useHtmlLang() {
  useEffect(() => {
    const lang = getLang();
    const htmlLang = document.documentElement.lang;

    if (lang !== htmlLang) {
      document.documentElement.lang = lang;
    }
  }, []);
}

const useHasHydrated = () => {
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
};

const loadAsyncGoogleFont = () => {
  const linkEl = document.createElement("link");
  const googleFontUrl = "https://fonts.googleapis.com";
  linkEl.rel = "stylesheet";
  linkEl.href =
    googleFontUrl + "/css2?family=Noto+Sans:wght@300;400;700;900&display=swap";
  document.head.appendChild(linkEl);
};

// if a bot is passed this HOC ensures that the bot is added to the store
// and that the user can directly have a chat session with it
function withBot(Component: React.FunctionComponent, bot?: Bot) {
  return function WithBotComponent() {
    const [botInitialized, setBotInitialized] = useState(false);
    const navigate = useNavigate();
    const botStore = useBotStore();
    const chatStore = useChatStore();
    if (bot && !botInitialized) {
      if (!bot.share?.id) {
        throw new Error("bot must have a shared id");
      }
      // ensure that bot for the same share id is not created a 2nd time
      let sharedBot = botStore.getByShareId(bot.share?.id);
      if (!sharedBot) {
        sharedBot = botStore.create(bot, { readOnly: true });
      }
      // let the user directly chat with the bot
      chatStore.ensureSession(sharedBot);
      setTimeout(() => {
        // redirect to chat - use history API to clear URL
        history.pushState({}, "", "/");
        navigate(Path.Chat);
      }, 1);
      setBotInitialized(true);
      return <LoadingModule />;
    }

    return <Component />;
  };
}

const SidebarContext = React.createContext<{
  showSidebar: boolean;
  setShowSidebar: (show: boolean) => void;
} | null>(null);

function SidebarContextProvider(props: { children: React.ReactNode }) {
  const [showSidebar, setShowSidebar] = useState(true);
  return (
    <SidebarContext.Provider value={{ showSidebar, setShowSidebar }}>
      {props.children}
    </SidebarContext.Provider>
  );
}

export const useSidebarContext = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error(
      "useSidebarContext must be used within an SidebarContextProvider",
    );
  }
  return context;
};

function Screen() {
  const isMobileScreen = useMobileScreen();
  const { showSidebar } = useSidebarContext();
  const { data: session, status } = useSession();
  const clientConfig = getClientConfig();

  const showSidebarOnMobile = showSidebar || !isMobileScreen;

  useEffect(() => {
    loadAsyncGoogleFont();
  }, []);

  if (status === "loading") return <LoadingModule />;
  return (
    <main className="flex overflow-hidden h-screen w-screen box-border">
      {clientConfig.hasNextAuth && !session ? (
        <LoginPage />
      ) : (
        <>
          {showSidebarOnMobile && <SideBar />}
          <div className="flex-1 overflow-hidden">
            <Routes>
              <Route path={Path.Chat} element={<ChatPage />} />
              <Route path={Path.Settings} element={<SettingsPage />} />
            </Routes>
          </div>
        </>
      )}
    </main>
  );
}

export function Home({ bot }: { bot?: Bot }) {
  useSwitchTheme();
  useHtmlLang();

  useEffect(() => {
    console.log("[Config] got config from build time", getClientConfig());
  }, []);

  if (!useHasHydrated()) {
    return <LoadingModule />;
  }

  const BotScreen = withBot(Screen, bot);
  const queryClient = new QueryClient();

  return (
    <ErrorBoundary>
      <Router>
        <QueryClientProvider client={queryClient}>
          <SidebarContextProvider>
            <BotScreen />
          </SidebarContextProvider>
        </QueryClientProvider>
      </Router>
    </ErrorBoundary>
  );
}