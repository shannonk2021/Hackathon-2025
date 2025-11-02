// --- DOM Elements ---
      const form = document.getElementById("internship-form");
      const submitButton = document.getElementById("submit-button");
      const resultsContainer = document.getElementById("results-container");
      const loader = document.getElementById("loader");
      const errorMessage = document.getElementById("error-message");
      const errorText = document.getElementById("error-text");
      const resultsList = document.getElementById("results-list");

      // --- Gemini API Configuration ---
      const API_KEY = "AIzaSyA0Fwzt0B648p6XPLC47LL1vssAWy2e6Fw";
      const API_MODEL = "gemini-2.5-flash-preview-09-2025";

      // API URL for the model
      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${API_MODEL}:generateContent?key=${API_KEY}`;

      // --- Event Listener ---
      form.addEventListener("submit", handleFormSubmit);

      // --- Link Validation Utility ---

      
       // Checks if a URL is likely an aggregator (third-party job board)
       // to prevent serving unvalidated or indirect links.
       // @param {string} url - The URL to check.
       // @returns {boolean} - True if the URL is from a blocked aggregator domain.
       
      function isAggregator(url) {
        if (typeof url !== "string" || !url) return true;
        try {
          const urlObject = new URL(url);
          const hostname = urlObject.hostname.toLowerCase();

          // Common aggregators to block (case-insensitive)
          const blockedDomains = [
            "indeed.com",
            "linkedin.com",
            "glassdoor.com",
            "handshake.com",
            "monster.com",
            "ziprecruiter.com",
            "simplyhired.com",
            "careerbuilder.com",
          ];

          // Check if the hostname or path contains any of the blocked domain names
          return blockedDomains.some((domain) => hostname.includes(domain));
        } catch (e) {
          // If the URL is not a valid URL structure, treat it as invalid
          return true;
        }
      }

      
       // Clears previous results and sets the loading state of the application.
       // @param {boolean} isLoading - Whether the application is currently loading.
       
      function setLoading(isLoading) {
        resultsContainer.classList.remove("hidden");

        if (isLoading) {
          // ERASE PAST SEARCH RESULTS
          resultsList.innerHTML = "";
          errorMessage.classList.add("hidden");

          loader.classList.remove("hidden");
          submitButton.disabled = true;
          submitButton.textContent = "Searching...";
        } else {
          // Hide all loaders and enable button
          loader.classList.add("hidden");
          submitButton.disabled = false;
          submitButton.textContent = "Find My Internships";
        }
      }

      
       // Displays an error message.
       // @param {string} message - The error message to display.
       
      function displayError(message) {
        errorText.textContent = message;
        errorMessage.classList.remove("hidden");
        resultsList.innerHTML = ""; // Ensure list is clear if an error occurred
      }

    
      //  Fetches a resource with exponential backoff retry logic.
      //  @param {string} url - The URL to fetch.
      //  @param {object} options - The fetch options (method, headers, body, etc.).
      //  @returns {Promise<Response>} - The successful response object.
      
      async function fetchWithBackoff(url, options) {
        const MAX_RETRIES = 5;
        let delay = 1000; // 1 second

        for (let i = 0; i < MAX_RETRIES; i++) {
          try {
            const response = await fetch(url, options);
            if (response.status !== 429 && response.status < 500) {
              return response;
            }
            throw new Error(`Retryable status code: ${response.status}`);
          } catch (error) {
            if (i === MAX_RETRIES - 1) {
              throw error;
            }
            // Wait for an increasing delay before retrying
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
          }
        }
      }

      
       // Handles the form submission event.
       // @param {Event} event - The form submission event.
      
      async function handleFormSubmit(event) {
        event.preventDefault();
        setLoading(true);

        // 1. Collect form data
        const formData = new FormData(form);
        const userProfile = {
          level: formData.get("academic-level"),
          gpa: formData.get("gpa"),
          major: formData.get("major"),
          interests: formData.get("interests"),
          demographics: formData.get("demographics"),
        };

        // 2. Construct the prompts
        const currentDate = new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        // CRITICAL UPDATE: System Prompt - STRONGLY EMPHASIZED Link Validation/Freshness
        const systemPrompt =
          "You are an expert internship researcher. Your task is to find a minimum of 5, currently open, legitimate internships. You are strictly forbidden from hallucinating any data. CRITICAL: The search results often contain expired or broken links (404 errors or refusal to connect). You MUST perform multiple search iterations to ensure the link (URL property) is HIGHLY likely to be working, currently active, and leads DIRECTLY to the official, primary company or organizational job board job *listing*. ABSOLUTELY AVOID ALL third-party job aggregators (like Indeed, LinkedIn, Handshake, Glassdoor, etc.). If a link is questionable or results in a redirect, discard it. The URL MUST be to an **active, direct company career page listing**. If the search tool does not yield a direct company link to an active application, you must skip that result. You MUST use the provided Google Search tool. Return ONLY a JSON array, with no other text.";

        // User Prompt for Internships
        const userPrompt = `
                Here is the student's profile:
                - Academic Level: ${userProfile.level}
                - GPA: ${userProfile.gpa}
                - Target Internship Field/Role: ${userProfile.major}
                - Key Skills/Experience: ${userProfile.interests || "N/A"}
                - Desired Location/Type: ${userProfile.demographics || "N/A"}

                Please find up to 10 internships that are a strong match for this profile. Use multiple search queries and take your time to ensure all 10 results are found if possible. Never make up or hallucinate internship data.
                
                CRITICAL REQUIREMENT: The internship MUST be currently accepting applications (deadline must be 'Rolling' or after ${currentDate}). The 'url' property MUST link directly to the official company's job posting page. DO NOT use links to job aggregators like Indeed or LinkedIn.
                
                For the internships, provide:
                1.  "title": The official title of the internship (e.g., "Software Engineer Intern").
                2.  "company": The company offering the internship.
                3.  "description": A brief one-sentence description of the role and what it involves.
                4.  "location": The location (e.g., "Remote", "New York, NY").
                5.  "duration": The typical duration or period (e.g., "Summer 2025 (12 Weeks)", "Ongoing").
                6.  "deadline": The application deadline (e.g., "October 31, 2025", "Rolling").
                7.  "url": The direct URL to the company's job listing or application page.

                Return ONLY a valid JSON array of internship objects with the above properties. Do not include any text, headers, or explanations outside the JSON array block.
            `;

        // 3. Call the Gemini API
        try {
          const responseData = await callGeminiApi(userPrompt, systemPrompt);

          if (responseData && Array.isArray(responseData)) {
            displayResults({
              internships: responseData,
            });
          } else {
            displayError(
              "The AI returned an unexpected format. Please try again."
            );
          }
        } catch (error) {
          console.error("Error calling Gemini API:", error);
          displayError(
            `An error occurred while fetching internships: ${error.message}`
          );
        } finally {
          setLoading(false);
        }
      }

      
       // Calls the Gemini API with exponential backoff.
       
      async function callGeminiApi(userPrompt, systemPrompt) {
        const payload = {
          contents: [
            {
              parts: [{ text: userPrompt }],
            },
          ],
          tools: [
            {
              google_search: {},
            },
          ],
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
        };

        const response = await fetchWithBackoff(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          let errorBody = await response.text();
          try {
            const errorJson = JSON.parse(errorBody);
            if (errorJson.error && errorJson.error.message) {
              errorBody = errorJson.error.message;
            }
          } catch (e) {}

          // Explicit check for authentication errors (401/403)
          if (response.status === 401 || response.status === 403) {
            throw new Error(
              `API request failed with status ${response.status} (Authentication/Permission Denied). Please ensure the API key is valid.`
            );
          }

          throw new Error(
            `API request failed with status ${response.status}: ${errorBody}`
          );
        }

        const result = await response.json();

        const candidate = result.candidates?.[0];
        const jsonText = candidate?.content?.parts?.[0]?.text;

        if (!jsonText) {
          if (result.promptFeedback) {
            console.error("Prompt Feedback:", result.promptFeedback);
            throw new Error(
              `Request was blocked. Reason: ${result.promptFeedback.blockReason}`
            );
          }
          throw new Error(
            "Invalid API response structure. No text content part found."
          );
        }

        // --- Robust JSON PARSING LOGIC ---
        try {
          let cleanJsonText = jsonText.trim();
          cleanJsonText = cleanJsonText
            .replace(/```json\s*/gs, "")
            .replace(/```/gs, "")
            .trim();

          let finalJsonString = cleanJsonText;

          const firstIndex = finalJsonString.search(/[\{\[]/);

          if (firstIndex !== -1) {
            const startChar = finalJsonString[firstIndex];
            const endChar = startChar === "{" ? "}" : "]";
            const lastIndex = finalJsonString.lastIndexOf(endChar);

            if (lastIndex > firstIndex) {
              finalJsonString = finalJsonString.substring(
                firstIndex,
                lastIndex + 1
              );
            } else {
              throw new Error("Cannot find matching closing brace/bracket.");
            }
          } else {
            throw new Error("No starting JSON character ({ or [) found.");
          }

          let parsedResult = JSON.parse(finalJsonString);

          // Expect an array of internships
          if (Array.isArray(parsedResult)) {
            return parsedResult;
          } else if (
            typeof parsedResult === "object" &&
            parsedResult !== null &&
            parsedResult.internships
          ) {
            // Handling potential root object structure if model deviates
            return parsedResult.internships;
          }

          throw new Error(
            "Parsed content did not match expected structure (JSON array of internships)."
          );
        } catch (parseError) {
          console.error(
            "Failed to parse JSON from raw API response. Raw Text:",
            jsonText,
            parseError
          );
          throw new Error(
            `The model response could not be parsed as JSON. Syntax Error: ${parseError.message}.`
          );
        }
        // --- END JSON PARSING LOGIC ---
      }

      
       // Simple utility to escape HTML characters in dynamic text.
       
      function escapeHTML(str) {
        if (typeof str !== "string") return "";
        return str.replace(/[&<>"']/g, function (m) {
          return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          }[m];
        });
      }

      
       // Displays the internship results as cards, filtering for unique and valid URLs.
       // @param {object} resultsObject - Object containing 'internships' array.
       
      function displayResults(resultsObject) {
        resultsList.innerHTML = ""; // Clear previous results

        const rawInternships = resultsObject.internships || [];

        // 1. Filter out duplicates and invalid/aggregator links
        const seenUrls = new Set();
        const uniqueInternships = rawInternships.filter((internship) => {
          const url = internship.url;

          // CRITICAL VALIDATION CHECK: Must be a string, start with http/https, and not be an aggregator.
          if (
            typeof url !== "string" ||
            (!url.startsWith("http://") && !url.startsWith("https://")) ||
            isAggregator(url)
          ) {
            console.warn("Filtered out invalid or aggregator URL:", url);
            return false;
          }

          // Uniqueness check
          if (seenUrls.has(url.toLowerCase())) {
            console.log("Skipping duplicate URL:", url);
            return false;
          }

          seenUrls.add(url.toLowerCase());
          return true;
        });

        const internships = uniqueInternships;

        // --- Display Internship Cards ---
        if (internships.length === 0) {
          resultsList.innerHTML += `<p class="text-gray-600 text-center p-6 rounded-xl bg-indigo-50 border-2 border-indigo-200">
                    <strong class="font-bold text-indigo-800">No Listings Found.</strong> 
                    We couldn't find any *currently open*, company-direct job postings that matched your criteria. Try broadening your search terms or checking back soon.
                    </p>`;
          return;
        }

        internships.forEach((internship) => {
          const cardClasses =
            "result-card rounded-xl p-6 transition-all duration-300 bg-white border border-gray-200 shadow-lg border-l-4 border-l-indigo-500";

          const buttonClasses =
            "inline-block bg-gradient-to-r from-indigo-500 to-blue-600 text-white font-semibold py-2 px-5 rounded-lg shadow-lg hover:from-indigo-600 hover:to-blue-700 transition-colors transform hover:shadow-xl";

          const icon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5 inline mr-1 text-green-600">
                         <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                       </svg>`;

          const card = document.createElement("div");
          card.className = cardClasses;

          card.innerHTML = `
                    <h3 class="text-xl font-bold text-gray-900 flex items-center mb-1">${icon}${escapeHTML(
            internship.title
          )}</h3>
                    <p class="text-sm font-semibold text-gray-500 mb-3">${
                      escapeHTML(internship.company) || "Confidential"
                    }</p>
                    <p class="text-gray-600 text-base">${escapeHTML(
                      internship.description
                    )}</p>
                    <div class="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                        <div>
                            <span class="text-xs font-medium uppercase text-gray-400">Location</span>
                            <p class="text-lg font-bold text-gray-800 mt-0.5">${
                              escapeHTML(internship.location) || "N/A"
                            }</p>
                        </div>
                        <div>
                            <span class="text-xs font-medium uppercase text-gray-400">Duration</span>
                            <p class="text-lg font-bold text-gray-800 mt-0.5">${
                              escapeHTML(internship.duration) || "Varies"
                            }</p>
                        </div>
                         <div>
                            <span class="text-xs font-medium uppercase text-gray-400">Deadline</span>
                            <p class="text-lg font-bold text-red-600 mt-0.5">${
                              escapeHTML(internship.deadline) || "Rolling"
                            }</p>
                        </div>
                    </div>
                    <div class="mt-6 text-left">
                        <a href="${escapeHTML(internship.url)}" 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           class="${buttonClasses}">
                            View & Apply &rarr;
                        </a>
                    </div>
                `;
          resultsList.appendChild(card);
        });
      }