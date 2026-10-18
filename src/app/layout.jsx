import '@ant-design/v5-patch-for-react-19';
import NextTopLoader from "nextjs-toploader";
import { Montserrat, Poppins, Roboto, Pacifico } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
    subsets: ["latin"],
    weight: ["300", "400", "500", "700"],
    variable: '--font-montserrat',
    display: 'swap',
});

const pacifico = Pacifico({
    subsets: ["latin"],
    weight: [ "400"],
    variable: '--font-pacifico',
    display: 'swap',
})

const poppins = Poppins({
    subsets: ["latin"],
    weight: ["100", "200", "300", "400", "500", "700"],
    variable: '--font-poppins',
    display: 'swap',
});

const roboto = Roboto({
    subsets: ["latin"],
    weight: ["300", "400", "500", "700", "800", "900"],
    variable: '--font-roboto',
});

export const metadata = {
    title: "Influna",
    description: "Let connect influencers with brands",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" className={`${montserrat.variable} ${poppins.variable} ${roboto.variable} ${pacifico.variable}`}>
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
