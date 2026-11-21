import { useEffect, useState, type FormEvent } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

interface AuthScreenProps {
  client: SupabaseClient;
}

export default function AuthScreen({ client }: AuthScreenProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signUpMode, setSignUpMode] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setAuthLoading(false);
      }
    });

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setErrorMessage(error.message);
        } else {
          setSession(data.session);
        }
        setAuthLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "認証状態を確認できませんでした。");
        setAuthLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setErrorMessage("");

    try {
      if (signUpMode) {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
          },
        });
        if (error) throw error;

        if (!data.session) {
          setMessage(
            "アカウントを作成しました。メール確認が有効なため、確認後にログインしてください。メール確認なしで使う場合はSupabaseの認証設定を確認してください。",
          );
        }
      } else {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "認証に失敗しました。設定と入力内容を確認してください。",
      );
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setErrorMessage("");
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ログアウトできませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <main className="setup-screen">
        <p role="status">ログイン状態を確認しています…</p>
      </main>
    );
  }

  if (session) {
    const signedInName =
      typeof session.user.user_metadata.display_name === "string"
        ? session.user.user_metadata.display_name
        : session.user.email ?? "利用者";

    return (
      <main className="setup-screen">
        <div className="setup-mark" aria-hidden="true">京</div>
        <span className="eyebrow">KYOTO BUS RIDE MAP</span>
        <h1>京都バス乗車記録</h1>
        <p className="setup-lead">こんにちは、{signedInName}さん。</p>
        <section className="setup-card">
          <h2>路線データの準備中</h2>
          <p>
            ログインできました。公式路線データの利用条件確認と登録が済むまで、乗車記録や進捗はまだ利用できません。
          </p>
          {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
          <button
            className="button button-secondary auth-signout"
            disabled={busy}
            onClick={() => void signOut()}
            type="button"
          >
            {busy ? "処理中…" : "ログアウト"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="setup-screen">
      <div className="setup-mark" aria-hidden="true">京</div>
      <span className="eyebrow">KYOTO BUS RIDE MAP</span>
      <h1>京都バス乗車記録</h1>
      <p className="setup-lead">招待した人だけで使う乗車記録です。</p>
      <section className="setup-card auth-card">
        <h2>{signUpMode ? "アカウントを作成" : "ログイン"}</h2>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {signUpMode && (
            <label>
              <span>表示名</span>
              <input
                autoComplete="nickname"
                maxLength={60}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
          )}
          <label>
            <span>メールアドレス</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>パスワード</span>
            <input
              autoComplete={signUpMode ? "new-password" : "current-password"}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="button button-primary" disabled={busy} type="submit">
            {busy ? "処理中…" : signUpMode ? "登録してはじめる" : "ログイン"}
          </button>
        </form>
        {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <button
          className="auth-mode-toggle"
          disabled={busy}
          onClick={() => {
            setSignUpMode(!signUpMode);
            setMessage("");
            setErrorMessage("");
          }}
          type="button"
        >
          {signUpMode ? "ログインはこちら" : "新規登録"}
        </button>
        <p className="auth-help">
          パスワードの再設定メールは未対応です。忘れた場合は管理者に相談してください。
        </p>
      </section>
    </main>
  );
}
