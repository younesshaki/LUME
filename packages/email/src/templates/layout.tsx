import type { CSSProperties, ReactNode } from "react";

const MAX_ACTION_URL_LENGTH = 2_048;

export type EmailAction = {
  href: string;
  label: string;
};

export type TransactionalEmailLayoutProps = {
  preview: string;
  heading: string;
  children: ReactNode;
  action: EmailAction;
  footer?: ReactNode;
};

export function TransactionalEmailLayout({
  preview,
  heading,
  children,
  action,
  footer,
}: TransactionalEmailLayoutProps) {
  const actionUrl = requireSafeActionUrl(action.href);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <title>{heading}</title>
      </head>
      <body style={styles.body}>
        <div aria-hidden="true" style={styles.preheader}>{preview}</div>
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={styles.page}>
          <tbody>
            <tr>
              <td align="center" style={styles.pageCell}>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding="0"
                  cellSpacing="0"
                  style={styles.card}
                >
                  <tbody>
                    <tr>
                      <td style={styles.brand}>LUME</td>
                    </tr>
                    <tr>
                      <td style={styles.content}>
                        <h1 style={styles.heading}>{heading}</h1>
                        {children}
                        <p style={styles.actionWrap}>
                          <a href={actionUrl} style={styles.action}>{action.label}</a>
                        </p>
                        <p style={styles.fallbackLabel}>
                          If the button does not work, copy and paste this link into your browser:
                        </p>
                        <p style={styles.fallbackUrl}>
                          <a href={actionUrl} style={styles.link}>{actionUrl}</a>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.footer}>
                        {footer ?? "This is an automated transactional email from LUME."}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function requireSafeActionUrl(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_ACTION_URL_LENGTH || /[\r\n]/.test(normalized)) {
    throw new Error("Email action URL is invalid");
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Email action URL must be absolute");
  }
  if (url.username || url.password) {
    throw new Error("Email action URL must not contain credentials");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new Error("Email action URL must use HTTPS outside loopback development");
  }
  return url.toString();
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]";
}

export const emailTextStyle: CSSProperties = {
  color: "#fff8ec",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 18px",
};

const styles: Record<string, CSSProperties> = {
  body: {
    backgroundColor: "#000000",
    color: "#fff8ec",
    margin: 0,
    padding: 0,
  },
  preheader: {
    color: "transparent",
    display: "none",
    fontSize: "1px",
    lineHeight: "1px",
    maxHeight: 0,
    maxWidth: 0,
    opacity: 0,
    overflow: "hidden",
  },
  page: {
    backgroundColor: "#000000",
    width: "100%",
  },
  pageCell: {
    padding: "32px 16px",
  },
  card: {
    backgroundColor: "#101011",
    border: "1px solid #3a3328",
    borderCollapse: "separate",
    borderRadius: "12px",
    maxWidth: "600px",
    overflow: "hidden",
    width: "100%",
  },
  brand: {
    backgroundColor: "#000000",
    color: "#fff8ec",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "18px",
    fontWeight: 700,
    letterSpacing: "6px",
    padding: "24px 32px",
  },
  content: {
    padding: "38px 32px 32px",
  },
  heading: {
    color: "#fff8ec",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "30px",
    fontWeight: 400,
    lineHeight: "38px",
    margin: "0 0 24px",
  },
  actionWrap: {
    margin: "28px 0",
  },
  action: {
    backgroundColor: "#d9b76a",
    borderRadius: "6px",
    color: "#101011",
    display: "inline-block",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "15px",
    fontWeight: 700,
    lineHeight: "20px",
    padding: "13px 20px",
    textDecoration: "none",
  },
  fallbackLabel: {
    color: "#c7bda8",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "0 0 6px",
  },
  fallbackUrl: {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "12px",
    lineHeight: "18px",
    margin: 0,
    overflowWrap: "anywhere",
    wordBreak: "break-all",
  },
  link: {
    color: "#d9b76a",
    textDecoration: "underline",
  },
  footer: {
    borderTop: "1px solid #3a3328",
    color: "#c7bda8",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "12px",
    lineHeight: "18px",
    padding: "20px 32px 24px",
  },
};
