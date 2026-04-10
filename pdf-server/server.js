// https://github.com/simonhaenisch/md-to-pdf/blob/8fe27113574f77377d44dda284d8e782588ada90/src/test/mathjax/mathjax-config.js
// https://www.npmjs.com/package/md-to-pdf
// https://github.com/simonhaenisch/md-to-pdf/blob/8fe27113574f77377d44dda284d8e782588ada90/src/test/mathjax/mathjax-config.js

import express from "express";
import cors from "cors";
import { mdToPdf } from "md-to-pdf";

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(cors());


app.post("/pdf", async (req, res) => {
  const { markdown } = req.body;

  const result = await mdToPdf(
    { content: markdown },
    {
      launch_options: { args: ["--no-sandbox"] },

      //MathJax reinladen
      script: [
        {
          //Konfiguration vor dem Laden setzen
          content: `
            window.MathJax = {
              tex: {
                inlineMath: [['$', '$'], ['\\(', '\\)']]
              }
            };
          `,
        },
        {
          url: "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js",
        },
      ],
    }
  );

  res.setHeader("Content-Type", "application/pdf");
  res.send(result.content);
});

app.listen(3000, () => console.log("PDF-Service läuft auf http://localhost:3000"));
