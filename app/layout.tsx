import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "book-releases",
  description: "Get an email when authors you follow announce or release new books.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
