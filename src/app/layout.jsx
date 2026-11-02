import '@ant-design/v5-patch-for-react-19';
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

export const metadata = {
    title: "Influna",
    description: "Let connect influencers with brands",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body suppressHydrationWarning={true}>
                <NextTopLoader
                    color="#77BEF0"
                    initialPosition={0.08}
                    crawlSpeed={200}
                    height={5}
                    crawl={true}
                    showSpinner={false}
                    easing="ease"
                    speed={100}
                    shadow="0 0 10px #2299DD,0 0 5px #2299DD"
                    template='<div class="bar" role="bar"><div class="peg"></div></div><div class="spinner" role="spinner"><div class="spinner-icon"></div></div>'
                    zIndex={1600}
                    showAtBottom={false}
                />
                  {children}
            </body>
        </html>
    );
}
