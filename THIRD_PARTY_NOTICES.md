# Third-party notices

This project (the SIH26-S02 grievance system, MIT-licensed — see `LICENSE`)
was built by merging and extending code from three separate open-source
projects. This file reproduces what each of their licenses requires.

## sih-web-portal/ — based on PRATYAKSH15/CitizenCare

https://github.com/PRATYAKSH15/CitizenCare — declared MIT in its own README
(`## License` → "MIT © PRATYAKSH15"). No separate `LICENSE` file exists in
that repository to reproduce verbatim, so the notice below is written in the
standard MIT form using their stated copyright holder.

```
MIT License

Copyright (c) PRATYAKSH15 (https://github.com/PRATYAKSH15)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## sih-ai-service/ — based in part on RiteshKumar2e/customer-complaint-agent_new

https://github.com/RiteshKumar2e/customer-complaint-agent_new — MIT-licensed,
reproduced verbatim from that repository's own `LICENSE` file. Its Groq and
Gemini LLM clients (`app/agents/gemini_client.py`, `app/agents/groq_client.py`,
and related agent modules) are imported into this project largely unmodified;
the full original agent stack is also preserved at `app/main.py` (unused by
this project's own entry point, `app/sih_main.py`, but kept intact).

```
MIT License

Copyright (c) 2025 Ritesh Kumar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## anshikaparikh/AI_Powered_Grievance_Redressal_System — referenced, not included

https://github.com/anshikaparikh/AI_Powered_Grievance_Redressal_System carries
no license — no `LICENSE` file, none declared in its README. Under default
copyright, that means no permission is granted to copy, modify, or
redistribute it, so **no code from this repository is included here**.

Its general approach (SentenceTransformers + FAISS for similarity search) was
used as a *reference point* while designing `app/sih/duplicate_detector.py`,
which is an original implementation with a different index type (cosine via
`IndexFlatIP` rather than L2), incremental persistence, and a geo gate — none
of which exist in the upstream file. A local, gitignored copy of the upstream
code lives at `sih-ai-service/vendor/faiss_reference/` for anyone who wants to
compare the two directly; clone the source repository yourself to populate it
— it is intentionally excluded from this repository (see `.gitignore`).
