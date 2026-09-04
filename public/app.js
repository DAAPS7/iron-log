      /* =====================================================================
   IRON LOG — vanilla JS fitness tracker
   Contas e dados guardados no servidor via Cloudflare Pages Functions +
   Cloudflare KV (ver functions/api/*.js). Uma cópia local em
   localStorage funciona como cache para arranque instantâneo/offline.
===================================================================== */

      const API_BASE = "/api";
      const CACHE_KEY = "iron_log_cache_v1";

      const STRENGTH_EXERCISES = [
        { name: "Wide Grip Lat Pulldown", muscle: "Lats" },
        { name: "Close Grip Lat Pulldown", muscle: "Lats" },
        { name: "Kneeling Lat Pulldown", muscle: "Lats" },
        { name: "Cable Lat Pullover", muscle: "Lats" },
        { name: "Rear Delt Cable Fly", muscle: "Rear Delts" },
        { name: "Hammer Curl", muscle: "Biceps" },
        { name: "Wide Grip EZ Bar Preacher Curl", muscle: "Biceps" },
        { name: "Wrist Curl", muscle: "Forearms" },
        { name: "Overhead Cable Tricep Extension", muscle: "Triceps" },
        { name: "Dumbbell Incline Press", muscle: "Chest" },
        { name: "Cable Lateral Raises", muscle: "Shoulders" },
        { name: "Bench Press", muscle: "Chest" },
        { name: "Lower Pec Cable Fly", muscle: "Chest" },
        { name: "Cable Tricep Pushdown", muscle: "Triceps" },
        { name: "Squat", muscle: "Legs" },
        { name: "Hip Thrust", muscle: "Glutes" },
        { name: "Leg Extension", muscle: "Quads" },
        { name: "Seated Leg Curl", muscle: "Hamstrings" },
        { name: "Calf Raises", muscle: "Calves" },
        { name: "Hip Adduction", muscle: "Adductors" },
        { name: "Hanging Crunches", muscle: "Abs" },
        { name: "Seated Machine Wide Row", muscle: "Back" },
        { name: "Seated Low Row", muscle: "Back" },
        { name: "Dumbbell Preacher Curl", muscle: "Biceps" },
        { name: "Bayesian Curl", muscle: "Biceps" },
        { name: "Reverse Wrist Curl", muscle: "Forearms" },
        { name: "Machine Chest Press", muscle: "Chest" },
        { name: "Shoulder Press", muscle: "Shoulders" },
        { name: "Dips", muscle: "Triceps" },
        { name: "Mid Pec Cable Fly", muscle: "Chest" },
        { name: "Unilateral Tricep Pushdown", muscle: "Triceps" },
      ];

      function defaultData() {
        return {
          profile: null,
          weightHistory: [],
          workouts: [],
          loggedWorkouts: [],
          calorieEntries: [],
          calorieGoal: null,
          macroGoals: { protein: null, carbs: null, fat: null },
          exercisePRs: {},
          mealPlans: [],
          metricGoals: {
            bodyFat: { target: null, targetDate: null },
            weight: { target: null, targetDate: null },
          },
        };
      }
      function defaultSettings() {
        const prefersDark =
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches;
        return {
          theme: prefersDark ? "dark" : "light",
          font: "unbounded-jakarta",
          accentStrength: null,
          accentCardio: null,
          radius: 14,
        };
      }

      let authToken = null;
      let currentUsername = null;
      let data = null;
      let currentSettings = defaultSettings();

      function uid() {
        return (
          Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
        );
      }

      function showToast(msg) {
        const t = document.getElementById("toast");
        t.textContent = msg;
        t.classList.add("show");
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => t.classList.remove("show"), 2200);
      }

      /* ---------------- Local cache (instant load + offline fallback) ---------------- */

      function saveCache() {
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              token: authToken,
              username: currentUsername,
              data,
              settings: currentSettings,
            }),
          );
        } catch (e) {
          console.error("Erro a guardar cache local", e);
        }
      }
      function loadCache() {
        try {
          const raw = localStorage.getItem(CACHE_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      }
      function clearCache() {
        localStorage.removeItem(CACHE_KEY);
      }

      /* ---------------- API calls ---------------- */

      async function apiRegister(username, password) {
        const res = await fetch(`${API_BASE}/auth-register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(json.error || "Não foi possível criar a conta.");
        return json;
      }
      async function apiLogin(username, password) {
        const res = await fetch(`${API_BASE}/auth-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Não foi possível entrar.");
        return json;
      }
      async function apiLoad(token) {
        const res = await fetch(`${API_BASE}/data-sync`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(json.error || "Erro");
          err.status = res.status;
          throw err;
        }
        return json;
      }
      async function apiSave(token, dataPayload, settingsPayload) {
        const res = await fetch(`${API_BASE}/data-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            data: dataPayload,
            settings: settingsPayload,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Erro ao guardar.");
        }
      }

      /* ---------------- Auth screen show/hide ---------------- */

      function showApp() {
        document.getElementById("appShell").style.display = "";
        document.getElementById("authScreen").classList.add("hidden");
      }
      function showAuth() {
        document.getElementById("appShell").style.display = "none";
        document.getElementById("authScreen").classList.remove("hidden");
      }

      async function completeLogin(token, displayName, resData, resSettings) {
        authToken = token;
        currentUsername = displayName;
        data = Object.assign(defaultData(), resData || {});
        currentSettings = Object.assign(defaultSettings(), resSettings || {});
        applySettings(currentSettings);
        saveCache();
        document.getElementById("headerUsername").textContent = displayName;
        document.getElementById("settingsUsername").textContent = displayName;
        showApp();
        setActiveTab("perfil");
        checkForSessionDraft();
        loadSocialState();
        if (!data.profile) {
          setTimeout(() => openProfileModal(false), 300);
        }
      }

      function logout() {
        clearCache();
        authToken = null;
        currentUsername = null;
        data = null;
        showAuth();
      }

      document.getElementById("authTabSeg").addEventListener("click", (e) => {
        if (e.target.tagName !== "BUTTON") return;
        document
          .querySelectorAll("#authTabSeg button")
          .forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
        const val = e.target.dataset.val;
        document.getElementById("loginForm").style.display =
          val === "login" ? "block" : "none";
        document.getElementById("registerForm").style.display =
          val === "register" ? "block" : "none";
        document.getElementById("loginError").style.display = "none";
        document.getElementById("registerError").style.display = "none";
      });

      document
        .getElementById("loginForm")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const errEl = document.getElementById("loginError");
          errEl.style.display = "none";
          const btn = e.target.querySelector("button[type=submit]");
          btn.disabled = true;
          try {
            const username = document
              .getElementById("loginUsername")
              .value.trim();
            const password = document.getElementById("loginPassword").value;
            const res = await apiLogin(username, password);
            document.getElementById("loginForm").reset();
            await completeLogin(
              res.token,
              res.displayName,
              res.data,
              res.settings,
            );
          } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = "block";
          } finally {
            btn.disabled = false;
          }
        });

      document
        .getElementById("registerForm")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const errEl = document.getElementById("registerError");
          errEl.style.display = "none";
          const btn = e.target.querySelector("button[type=submit]");
          btn.disabled = true;
          try {
            const username = document
              .getElementById("regUsername")
              .value.trim();
            const password = document.getElementById("regPassword").value;
            const password2 = document.getElementById("regPassword2").value;
            if (password !== password2) {
              throw new Error("As palavras-passe não coincidem.");
            }
            const res = await apiRegister(username, password);
            document.getElementById("registerForm").reset();
            await completeLogin(
              res.token,
              res.displayName,
              res.data,
              res.settings,
            );
          } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = "block";
          } finally {
            btn.disabled = false;
          }
        });

      document.getElementById("logoutBtn").addEventListener("click", () => {
        if (!confirm("Terminar sessão?")) return;
        closeModal("modalSettings");
        logout();
      });

      /* ---------------- Data persistence (cache + server sync) ---------------- */

      function saveData() {
        if (!currentUsername) return;
        saveCache();
        const statusNote = document.getElementById("syncStatusNote");
        apiSave(authToken, data, currentSettings)
          .then(() => {
            if (statusNote)
              statusNote.textContent = "Sincronizado com o servidor.";
          })
          .catch((err) => {
            console.error(err);
            if (statusNote)
              statusNote.textContent =
                "Sem ligação ao servidor — guardado só localmente por agora.";
            showToast("Sem ligação — guardado só localmente por agora.");
          });
      }

      /* ---------------- Appearance settings ---------------- */

      function rgbStringToHex(str) {
        if (!str) return null;
        str = str.trim();
        if (str.startsWith("#")) return str;
        const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return null;
        return (
          "#" +
          [1, 2, 3]
            .map((i) => parseInt(m[i]).toString(16).padStart(2, "0"))
            .join("")
        );
      }
      function getComputedColorHex(varName) {
        const val = getComputedStyle(document.documentElement).getPropertyValue(
          varName,
        );
        return rgbStringToHex(val) || "#E3572D";
      }

      function applySettings(settings) {
        document.documentElement.setAttribute("data-theme", settings.theme);
        document.documentElement.setAttribute("data-font", settings.font);
        if (settings.accentStrength)
          document.documentElement.style.setProperty(
            "--strength",
            settings.accentStrength,
          );
        else document.documentElement.style.removeProperty("--strength");
        if (settings.accentCardio)
          document.documentElement.style.setProperty(
            "--cardio",
            settings.accentCardio,
          );
        else document.documentElement.style.removeProperty("--cardio");
        document.documentElement.style.setProperty(
          "--radius",
          settings.radius + "px",
        );
        document.documentElement.style.setProperty(
          "--radius-sm",
          Math.max(4, Math.round(settings.radius * 0.6)) + "px",
        );
        syncSettingsControls(settings);
      }

      function syncSettingsControls(settings) {
        const themeSeg = document.getElementById("settingsThemeSeg");
        if (themeSeg)
          themeSeg
            .querySelectorAll("button")
            .forEach((b) =>
              b.classList.toggle("active", b.dataset.val === settings.theme),
            );
        const fontSel = document.getElementById("settingsFont");
        if (fontSel) fontSel.value = settings.font;
        const accStrength = document.getElementById("settingsAccentStrength");
        if (accStrength)
          accStrength.value =
            settings.accentStrength || getComputedColorHex("--strength");
        const accCardio = document.getElementById("settingsAccentCardio");
        if (accCardio)
          accCardio.value =
            settings.accentCardio || getComputedColorHex("--cardio");
        const radiusInput = document.getElementById("settingsRadius");
        if (radiusInput) radiusInput.value = settings.radius;
        const radiusVal = document.getElementById("radiusVal");
        if (radiusVal) radiusVal.textContent = settings.radius + "px";
      }

      function persistSettings() {
        applySettings(currentSettings);
        saveData();
        if (document.getElementById("tab-perfil").classList.contains("active"))
          drawWeightChart();
        if (
          document.getElementById("tab-progresso").classList.contains("active")
        )
          updateProgressView(progressSelected);
      }

      document
        .getElementById("friendsHeaderBtn")
        .addEventListener("click", () => setActiveTab("amigos"));
      document.getElementById("settingsBtn").addEventListener("click", () => {
        syncSettingsControls(currentSettings);
        openModal("modalSettings");
      });
      document
        .getElementById("settingsThemeSeg")
        .addEventListener("click", (e) => {
          if (e.target.tagName !== "BUTTON") return;
          currentSettings.theme = e.target.dataset.val;
          persistSettings();
        });
      document
        .getElementById("settingsFont")
        .addEventListener("change", (e) => {
          currentSettings.font = e.target.value;
          persistSettings();
        });
      document
        .getElementById("settingsAccentStrength")
        .addEventListener("input", (e) => {
          currentSettings.accentStrength = e.target.value;
          persistSettings();
        });
      document
        .getElementById("settingsAccentCardio")
        .addEventListener("input", (e) => {
          currentSettings.accentCardio = e.target.value;
          persistSettings();
        });
      document
        .getElementById("settingsRadius")
        .addEventListener("input", (e) => {
          currentSettings.radius = parseInt(e.target.value);
          persistSettings();
        });
      document
        .getElementById("resetAppearanceBtn")
        .addEventListener("click", () => {
          currentSettings = Object.assign(defaultSettings(), {
            theme: currentSettings.theme,
          });
          persistSettings();
          showToast("Aparência reposta.");
        });

      /* ---------------- Personal backup: export / import ---------------- */

      document.getElementById("exportBtn").addEventListener("click", () => {
        const payload = {
          username: currentUsername,
          data,
          settings: currentSettings,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `iron-log-${currentUsername}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Cópia exportada.");
      });
      document.getElementById("importBtn").addEventListener("click", () => {
        document.getElementById("importFile").click();
      });
      document.getElementById("importFile").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(reader.result);
            if (
              !confirm(
                "Isto substitui os teus dados atuais (nesta conta) pelos do ficheiro. Continuar?",
              )
            )
              return;
            data = Object.assign(defaultData(), parsed.data || {});
            currentSettings = Object.assign(
              defaultSettings(),
              parsed.settings || {},
            );
            applySettings(currentSettings);
            saveData();
            showToast("Dados importados.");
            setActiveTab("perfil");
          } catch (err) {
            showToast("Ficheiro inválido.");
          }
        };
        reader.readAsText(file);
        e.target.value = "";
      });

      /* ---------------- Biometric calculations ---------------- */

      function computeAge(birthdateStr) {
        const b = new Date(birthdateStr);
        const now = new Date();
        let age = now.getFullYear() - b.getFullYear();
        const beforeBirthday =
          now.getMonth() < b.getMonth() ||
          (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
        if (beforeBirthday) age--;
        return age;
      }

      function computeBMI(weightKg, heightM) {
        const bmi = weightKg / (heightM * heightM);
        return Math.round(bmi * 100) / 100;
      }
      function classifyBMI(bmi) {
        if (bmi < 16) return "Magreza Severa";
        if (bmi < 17) return "Magreza Moderada";
        if (bmi < 18.5) return "Magreza Leve";
        if (bmi < 25) return "Normal";
        if (bmi < 30) return "Excesso de Peso";
        if (bmi < 35) return "Obesidade I";
        if (bmi < 40) return "Obesidade II";
        return "Obesidade III";
      }

      function computeBodyFat(gender, heightM, waist, neck, hip) {
        if (gender) {
          if (waist == null || neck == null) return null;
        } else {
          if (waist == null || neck == null || hip == null) return null;
        }
        const heightCm = heightM * 100;
        let bf;
        if (gender) {
          bf =
            495 /
              (1.0324 -
                0.19077 * Math.log10(waist - neck) +
                0.15456 * Math.log10(heightCm)) -
            450;
        } else {
          bf =
            495 /
              (1.29579 -
                0.35004 * Math.log10(waist + hip - neck) +
                0.221 * Math.log10(heightCm)) -
            450;
        }
        if (!isFinite(bf)) return null;
        return Math.round(bf * 100) / 100;
      }
      function classifyBodyFat(bf, gender) {
        if (bf == null) return "";
        if (gender) {
          if (bf <= 7) return "Definido";
          if (bf <= 13) return "Atleta";
          if (bf <= 17) return "Fitness";
          if (bf <= 25) return "Médio";
          return "Elevado";
        } else {
          if (bf <= 13) return "Definido";
          if (bf <= 20) return "Atleta";
          if (bf <= 24) return "Fitness";
          if (bf <= 32) return "Médio";
          return "Elevado";
        }
      }

      function computeBMR(gender, weightKg, heightM, age) {
        const heightCm = heightM * 100;
        if (gender) {
          return Math.round(
            88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age,
          );
        } else {
          return Math.round(
            447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age,
          );
        }
      }

      /* ---------------- Tabs / navigation ---------------- */

      function setActiveTab(tab) {
        document
          .querySelectorAll(".tab-panel")
          .forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab));
        document
          .querySelectorAll("#desktopNav button, #bottomNav button")
          .forEach((b) => {
            b.classList.toggle("active", b.dataset.tab === tab);
          });
        document
          .getElementById("friendsHeaderBtn")
          .classList.toggle("icon-btn-active", tab === "amigos");
        if (tab === "perfil") renderPerfil();
        if (tab === "treinos") renderWorkouts();
        if (tab === "calorias") renderCaloriasTab();
        if (tab === "progresso") renderProgresso();
        if (tab === "amigos") renderAmigosTab();
        if (tab === "historico") renderHistorico();
        window.scrollTo({ top: 0 });
      }
      document
        .querySelectorAll("#desktopNav button, #bottomNav button")
        .forEach((b) => {
          b.addEventListener("click", () => setActiveTab(b.dataset.tab));
        });
      function refreshCurrentTab() {
        const activePanel = document.querySelector(".tab-panel.active");
        if (!activePanel) return;
        setActiveTab(activePanel.id.replace("tab-", ""));
      }

      /* ---------------- Modal helpers ---------------- */

      function openModal(id) {
        document.getElementById(id).classList.add("open");
      }
      function closeModal(id) {
        document.getElementById(id).classList.remove("open");
      }
      document.querySelectorAll("[data-close]").forEach((b) => {
        b.addEventListener("click", () => closeModal(b.dataset.close));
      });
      // Estes dois modais podem ter bastante trabalho em curso (exercícios, séries)
      // que se perderia com um toque acidental fora da janela — por isso só fecham
      // pelo botão ✕ ou pelas ações explícitas (Guardar / Concluir / Apagar).
      const NO_BACKDROP_CLOSE = new Set([
        "modalWorkout",
        "modalSession",
        "modalMealPlan",
        "modalFoodPicker",
      ]);
      document.querySelectorAll(".modal-overlay").forEach((ov) => {
        ov.addEventListener("click", (e) => {
          if (e.target === ov && !NO_BACKDROP_CLOSE.has(ov.id))
            ov.classList.remove("open");
        });
      });

      /* ===================== PERFIL TAB ===================== */

      function renderPerfil() {
        const el = document.getElementById("perfilContent");
        if (!data.profile) {
          el.innerHTML = `<div class="empty">
      <div class="display">Sem perfil ainda</div>
      <p>Configura as tuas medidas para veres a tua gordura corporal e o metabolismo basal.</p>
      <button class="btn btn-strength" id="startOnboardingBtn">Configurar perfil</button>
    </div>`;
          document
            .getElementById("startOnboardingBtn")
            .addEventListener("click", () => openProfileModal(false));
          return;
        }

        const p = data.profile;
        const age = computeAge(p.birthdate);
        const weight = getCurrentWeight();
        const bf = computeBodyFat(p.gender, p.height, p.waist, p.neck, p.hip);
        const bmr = weight ? computeBMR(p.gender, weight, p.height, age) : null;

        const bfPct =
          bf != null ? Math.max(0, Math.min(100, (bf / 45) * 100)) : 0;

        el.innerHTML = `
  <div class="grid grid-2" style="margin-bottom:14px;">
    ${ringCard("Gordura Corporal", bf ?? "—", bf != null ? "%" : "", bfPct, bf != null ? classifyBodyFat(bf, p.gender) : "sem dados", "var(--strength)", "card-clickable", 'data-metric="bodyfat"')}
    <div class="card card-clickable card-accent-info" data-metric="bmr">
      <div class="card-title">Metabolismo Basal</div>
      <div style="display:flex; align-items:baseline; gap:6px; margin-top:8px;">
        <span class="display" style="font-size:34px; color:var(--info);">${bmr ?? "—"}</span>
        <span style="color:var(--muted); font-size:12px;">kcal / dia</span>
      </div>
      <div class="small-note">Energia gasta em repouso. Toca para saberes mais.</div>
    </div>
  </div>

  <div class="grid grid-2" style="margin-bottom:14px;">
    <div class="card card-clickable card-accent-cardio" data-metric="weight">
      <div class="card-title">Peso Atual
        <button class="btn btn-ghost btn-sm" id="logWeightBtn">+ Registar</button>
      </div>
      <div style="display:flex; align-items:baseline; gap:6px; margin:6px 0 10px;">
        <span class="display" style="font-size:34px; color:var(--cardio);">${weight ?? "—"}</span>
        <span style="color:var(--muted); font-size:12px;">kg</span>
      </div>
      <canvas id="weightChart" height="90" style="width:100%;"></canvas>
    </div>
    <div class="card card-accent-gold">
      <div class="card-title">Perfil
        <button class="btn btn-ghost btn-sm" id="editProfileBtn">Editar</button>
      </div>
      <div class="mono" style="font-size:13px; line-height:2;">
        <div>${p.firstName} ${p.lastName} · ${age} anos</div>
        <div>Altura: ${p.height} m</div>
        <div>Pescoço / Cintura${p.gender ? "" : " / Anca"}: ${p.neck ?? "—"} / ${p.waist ?? "—"}${p.gender ? "" : ` / ${p.hip ?? "—"}`} cm</div>
      </div>
    </div>
  </div>
  `;

        document
          .getElementById("logWeightBtn")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            document.getElementById("wDate").value = new Date()
              .toISOString()
              .slice(0, 10);
            document.getElementById("wWeight").value = weight ?? "";
            openModal("modalWeight");
          });
        document
          .getElementById("editProfileBtn")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            openProfileModal(true);
          });

        el.querySelectorAll("[data-metric]").forEach((card) => {
          card.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            openMetricInsight(card.dataset.metric, { bf, bmr, weight, p, age });
          });
        });

        drawWeightChart();
      }

      function ringColorForBMI(bmi) {
        if (bmi === null) return "var(--muted)";
        if (bmi >= 18.5 && bmi < 25) return "var(--cardio)";
        if (bmi < 18.5) return "var(--gold)";
        return "var(--strength)";
      }

      function openMetricInsight(metric, ctx) {
        const titleEl = document.getElementById("metricInsightTitle");
        const bodyEl = document.getElementById("metricInsightBody");

        if (metric === "bodyfat") {
          titleEl.textContent = "Gordura Corporal";
          const bf = ctx.bf;
          const goal = (data.metricGoals && data.metricGoals.bodyFat) || {
            target: null,
            targetDate: null,
          };
          let progressNote = "";
          if (bf != null && goal.target != null) {
            const diff = Math.round((bf - goal.target) * 10) / 10;
            progressNote =
              diff <= 0
                ? "Já atingiste (ou ultrapassaste) esta meta!"
                : `Faltam ${diff} pontos percentuais para a meta.`;
          }
          bodyEl.innerHTML = `
            <p class="small-note" style="margin-top:0;">Esta é uma estimativa (método da Marinha dos EUA) baseada nas medidas que introduziste — não substitui uma avaliação profissional (ex: bioimpedância ou DEXA), mas serve bem para acompanhar tendências ao longo do tempo.</p>
            <p class="small-note">A percentagem de gordura tende a descer de forma sustentável com treino de força regular, alguma atividade cardiovascular, e um défice calórico moderado e consistente. Métodos extremos ou mudanças muito rápidas costumam ser difíceis de manter — fala com um profissional de saúde antes de perseguires um objetivo agressivo.</p>
            <div class="card-title" style="margin-top:16px;">Definir meta (opcional)</div>
            <div class="field-row">
              <div class="field"><label>Gordura alvo (%)</label><input type="number" min="0" step="0.1" id="goalBodyFatTarget" value="${goal.target ?? ""}"></div>
              <div class="field"><label>Data alvo</label><input type="date" id="goalBodyFatDate" value="${goal.targetDate ?? ""}"></div>
            </div>
            ${progressNote ? `<p class="small-note">${progressNote}</p>` : ""}
            <button class="btn btn-strength btn-block" id="saveBodyFatGoalBtn">Guardar meta</button>
          `;
          document
            .getElementById("saveBodyFatGoalBtn")
            .addEventListener("click", () => {
              const t = parseFloat(
                document.getElementById("goalBodyFatTarget").value,
              );
              const d = document.getElementById("goalBodyFatDate").value;
              data.metricGoals = data.metricGoals || {};
              data.metricGoals.bodyFat = {
                target: isNaN(t) ? null : t,
                targetDate: d || null,
              };
              saveData();
              showToast("Meta guardada.");
              closeModal("modalMetricInsight");
            });
        } else if (metric === "bmr") {
          titleEl.textContent = "Metabolismo Basal (BMR)";
          bodyEl.innerHTML = `
            <p class="small-note" style="margin-top:0;">O BMR é uma estimativa das calorias que o teu corpo gasta em repouso completo, só para manter as funções vitais — não inclui a energia que gastas a mexer-te ao longo do dia.</p>
            <p class="small-note">Depende sobretudo da tua massa muscular, idade, altura e peso. Não é algo que se "melhore" diretamente, mas manter ou aumentar massa muscular através de treino de força tende a sustentar (ou aumentar ligeiramente) este valor ao longo do tempo, já que o músculo consome mais energia em repouso do que a gordura.</p>
            <p class="small-note">Costuma ser usado como ponto de partida para estimar as tuas necessidades calóricas totais, juntando depois o teu nível de atividade física.</p>
          `;
        } else if (metric === "weight") {
          titleEl.textContent = "Peso Corporal";
          const weight = ctx.weight;
          const goal = (data.metricGoals && data.metricGoals.weight) || {
            target: null,
            targetDate: null,
          };
          let progressNote = "";
          if (weight != null && goal.target != null) {
            const diff = Math.round((weight - goal.target) * 10) / 10;
            if (diff === 0) {
              progressNote = "Já estás na tua meta!";
            } else {
              let dateNote = "";
              if (goal.targetDate) {
                const daysLeft = Math.ceil(
                  (new Date(goal.targetDate) - new Date()) /
                    (1000 * 60 * 60 * 24),
                );
                if (daysLeft > 0) {
                  const weeklyRate = Math.abs(diff) / (daysLeft / 7);
                  dateNote = ` Faltam ${daysLeft} dia(s) — uma média de ≈${Math.round(weeklyRate * 100) / 100} kg/semana.`;
                } else {
                  dateNote = " A data alvo já passou.";
                }
              }
              progressNote = `Faltam ${Math.abs(diff)} kg para a meta.${dateNote}`;
            }
          }
          bodyEl.innerHTML = `
            <p class="small-note" style="margin-top:0;">O teu peso pode variar de dia para dia por razões normais (hidratação, alimentação, sono) — o que importa é a tendência ao longo de várias semanas, não um valor isolado.</p>
            <p class="small-note">Uma referência geralmente considerada sustentável é uma variação de cerca de 0.25% a 1% do peso corporal por semana, dependendo do objetivo. Ritmos muito mais rápidos tendem a ser difíceis de manter e podem trazer efeitos indesejados — fala com um profissional de saúde para uma orientação personalizada.</p>
            <div class="card-title" style="margin-top:16px;">Definir meta (opcional)</div>
            <div class="field-row">
              <div class="field"><label>Peso alvo (kg)</label><input type="number" min="0" step="0.1" id="goalWeightTarget" value="${goal.target ?? ""}"></div>
              <div class="field"><label>Data alvo</label><input type="date" id="goalWeightDate" value="${goal.targetDate ?? ""}"></div>
            </div>
            ${progressNote ? `<p class="small-note">${progressNote}</p>` : ""}
            <button class="btn btn-strength btn-block" id="saveWeightGoalBtn">Guardar meta</button>
          `;
          document
            .getElementById("saveWeightGoalBtn")
            .addEventListener("click", () => {
              const t = parseFloat(
                document.getElementById("goalWeightTarget").value,
              );
              const d = document.getElementById("goalWeightDate").value;
              data.metricGoals = data.metricGoals || {};
              data.metricGoals.weight = {
                target: isNaN(t) ? null : t,
                targetDate: d || null,
              };
              saveData();
              showToast("Meta guardada.");
              closeModal("modalMetricInsight");
            });
        }

        openModal("modalMetricInsight");
      }

      function ringCard(label, value, unit, pct, tag, color, extraClass, extraAttrs) {
        const r = 48,
          c = 2 * Math.PI * r;
        const offset = c - (pct / 100) * c;
        return `<div class="card ring-card${extraClass ? " " + extraClass : ""}"${extraAttrs ? " " + extraAttrs : ""}>
    <div class="card-title" style="width:100%;">${label}</div>
    <div class="ring-wrap">
      <svg width="118" height="118" viewBox="0 0 118 118">
        <circle cx="59" cy="59" r="${r}" fill="none" stroke="var(--bg-soft)" stroke-width="10"/>
        <circle cx="59" cy="59" r="${r}" fill="none" stroke="${color}" stroke-width="10"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
      </svg>
      <div class="ring-value">
        <span class="num">${value}</span>
        ${unit ? `<span class="unit">${unit}</span>` : ""}
      </div>
    </div>
    ${tag ? `<span class="ring-tag" style="background:color-mix(in srgb, ${color} 18%, var(--surface)); color:${color};">${tag}</span>` : ""}
  </div>`;
      }

      function getCurrentWeight() {
        if (!data.weightHistory.length) return null;
        const sorted = [...data.weightHistory].sort(
          (a, b) => new Date(a.date) - new Date(b.date),
        );
        return sorted[sorted.length - 1].weight;
      }

      /* ---------------- Generic line chart (used by Perfil + Progresso) ---------------- */

      function drawLineChart(canvas, points, colorVarName) {
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth,
          h = canvas.clientHeight || 90;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const mutedColor =
          getComputedStyle(document.body).getPropertyValue("--muted").trim() ||
          "#5C665F";
        const lineColor =
          getComputedStyle(document.body)
            .getPropertyValue(colorVarName || "--strength")
            .trim() || "#E3572D";
        const inkColor =
          getComputedStyle(document.body).getPropertyValue("--ink").trim() ||
          "#1B211D";

        if (points.length < 2) {
          ctx.fillStyle = mutedColor;
          ctx.font = "12px sans-serif";
          ctx.fillText(
            "Regista pelo menos 2 valores para veres o gráfico.",
            4,
            h / 2,
          );
          return;
        }
        const vals = points.map((p) => p.value);
        const min = Math.min(...vals),
          max = Math.max(...vals);
        const range = max - min || 1;

        // Espaço reservado para os valores dos eixos
        const padLeft = 40,
          padRight = 8,
          padTop = 10,
          padBottom = 18;
        const plotW = w - padLeft - padRight,
          plotH = h - padTop - padBottom;
        const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

        function xFor(i) {
          return padLeft + i * stepX;
        }
        function yFor(v) {
          return padTop + plotH - ((v - min) / range) * plotH;
        }

        // eixo Y: valor máximo (topo) e mínimo (fundo)
        ctx.fillStyle = mutedColor;
        ctx.font = "10px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(formatAxisNumber(max), padLeft - 6, padTop + 8);
        ctx.fillText(formatAxisNumber(min), padLeft - 6, padTop + plotH);
        ctx.textAlign = "left";

        // linha guia subtil
        ctx.strokeStyle = mutedColor;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padLeft, padTop + plotH + 0.5);
        ctx.lineTo(padLeft + plotW, padTop + plotH + 0.5);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // eixo X: primeira e última data
        ctx.fillStyle = mutedColor;
        ctx.textAlign = "left";
        ctx.fillText(formatAxisDate(points[0].date), padLeft, h - 2);
        ctx.textAlign = "right";
        ctx.fillText(
          formatAxisDate(points[points.length - 1].date),
          padLeft + plotW,
          h - 2,
        );
        ctx.textAlign = "left";

        ctx.beginPath();
        points.forEach((p, i) => {
          const x = xFor(i),
            y = yFor(p.value);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();

        points.forEach((p, i) => {
          const x = xFor(i),
            y = yFor(p.value);
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = inkColor;
          ctx.fill();
        });
      }

      function formatAxisNumber(n) {
        return Number.isInteger(n) ? String(n) : n.toFixed(1);
      }
      function formatAxisDate(dateStr) {
        const d = new Date(dateStr + "T00:00:00");
        return d.toLocaleDateString("pt-PT", {
          day: "2-digit",
          month: "2-digit",
        });
      }

      function cssVar(name) {
        return getComputedStyle(document.body).getPropertyValue(name).trim();
      }

      function getMonday(dateStr) {
        const d = new Date(dateStr + "T00:00:00");
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().slice(0, 10);
      }

      function drawWeightWeeklyChart(canvas, dailyPoints) {
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth,
          h = canvas.clientHeight || 140;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const mutedColor = cssVar("--muted") || "#5C665F";
        const strengthColor = cssVar("--strength") || "#E3572D";
        const cardioColor = cssVar("--cardio") || "#1D7874";

        if (dailyPoints.length < 2) {
          ctx.fillStyle = mutedColor;
          ctx.font = "12px sans-serif";
          ctx.fillText(
            "Regista pelo menos 2 valores para veres o gráfico.",
            4,
            h / 2,
          );
          return;
        }

        const weekMap = new Map();
        dailyPoints.forEach((p) => {
          const monday = getMonday(p.date);
          if (!weekMap.has(monday)) weekMap.set(monday, { sum: 0, count: 0 });
          const e = weekMap.get(monday);
          e.sum += p.value;
          e.count += 1;
        });
        const weeklyPoints = [...weekMap.entries()]
          .map(([date, { sum, count }]) => ({ date, value: sum / count }))
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        const allPoints = [...dailyPoints, ...weeklyPoints];
        const dates = allPoints.map((p) =>
          new Date(p.date + "T00:00:00").getTime(),
        );
        const minDate = Math.min(...dates),
          maxDate = Math.max(...dates),
          dateRange = maxDate - minDate || 1;
        const vals = allPoints.map((p) => p.value);
        const minV = Math.min(...vals),
          maxV = Math.max(...vals),
          rangeV = maxV - minV || 1;
        const padLeft = 40,
          padRight = 8,
          padTop = 26,
          padBottom = 18;
        const plotW = w - padLeft - padRight,
          plotH = h - padTop - padBottom;

        function xFor(dateStr) {
          const t = new Date(dateStr + "T00:00:00").getTime();
          return padLeft + ((t - minDate) / dateRange) * plotW;
        }
        function yFor(v) {
          return padTop + plotH - ((v - minV) / rangeV) * plotH;
        }

        // eixo Y: valor máximo (topo) e mínimo (fundo)
        ctx.fillStyle = mutedColor;
        ctx.font = "10px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(formatAxisNumber(maxV), padLeft - 6, padTop + 8);
        ctx.fillText(formatAxisNumber(minV), padLeft - 6, padTop + plotH);
        ctx.textAlign = "left";

        // eixo X: primeira e última data
        ctx.fillStyle = mutedColor;
        ctx.textAlign = "left";
        ctx.fillText(formatAxisDate(dailyPoints[0].date), padLeft, h - 2);
        ctx.textAlign = "right";
        ctx.fillText(
          formatAxisDate(dailyPoints[dailyPoints.length - 1].date),
          padLeft + plotW,
          h - 2,
        );
        ctx.textAlign = "left";

        // linha diária (fina, semi-transparente)
        ctx.beginPath();
        dailyPoints.forEach((p, i) => {
          const x = xFor(p.date),
            y = yFor(p.value);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = strengthColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.globalAlpha = 1;
        dailyPoints.forEach((p) => {
          const x = xFor(p.date),
            y = yFor(p.value);
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fillStyle = strengthColor;
          ctx.globalAlpha = 0.55;
          ctx.fill();
          ctx.globalAlpha = 1;
        });

        // linha da média semanal (grossa, cor de destaque)
        if (weeklyPoints.length >= 2) {
          ctx.beginPath();
          weeklyPoints.forEach((p, i) => {
            const x = xFor(p.date),
              y = yFor(p.value);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.strokeStyle = cardioColor;
          ctx.lineWidth = 3;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke();
        }
        weeklyPoints.forEach((p) => {
          const x = xFor(p.date),
            y = yFor(p.value);
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = cardioColor;
          ctx.fill();
        });

        // legenda
        ctx.font = "10px sans-serif";
        ctx.fillStyle = strengthColor;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(padLeft, 4, 8, 3);
        ctx.globalAlpha = 1;
        ctx.fillStyle = mutedColor;
        ctx.fillText("Diário", padLeft + 12, 10);
        ctx.fillStyle = cardioColor;
        ctx.fillRect(padLeft + 58, 4, 8, 3);
        ctx.fillStyle = mutedColor;
        ctx.fillText("Média semanal", padLeft + 70, 10);
      }

      function drawWeightChart() {
        const canvas = document.getElementById("weightChart");
        if (!canvas) return;
        const pts = [...data.weightHistory]
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(-14)
          .map((p) => ({ date: p.date, value: p.weight }));
        drawLineChart(canvas, pts);
      }
      window.addEventListener("resize", () => {
        if (!currentUsername) return;
        if (document.getElementById("tab-perfil").classList.contains("active"))
          drawWeightChart();
        if (
          document.getElementById("tab-progresso").classList.contains("active")
        )
          updateProgressView(progressSelected);
      });

      /* ---- profile form ---- */

      const MONTH_NAMES = [
        "Janeiro",
        "Fevereiro",
        "Março",
        "Abril",
        "Maio",
        "Junho",
        "Julho",
        "Agosto",
        "Setembro",
        "Outubro",
        "Novembro",
        "Dezembro",
      ];

      function populateBirthdateSelects() {
        const daySel = document.getElementById("pBirthDay");
        const monthSel = document.getElementById("pBirthMonth");
        const yearSel = document.getElementById("pBirthYear");
        if (daySel.options.length) return; // já populado, evita repetir
        daySel.innerHTML = Array.from({ length: 31 }, (_, i) => i + 1)
          .map((d) => `<option value="${d}">${d}</option>`)
          .join("");
        monthSel.innerHTML = MONTH_NAMES.map(
          (m, i) => `<option value="${i + 1}">${m}</option>`,
        ).join("");
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let y = currentYear - 10; y >= currentYear - 100; y--)
          years.push(y);
        yearSel.innerHTML = years
          .map((y) => `<option value="${y}">${y}</option>`)
          .join("");
      }

      function setBirthdateSelects(dateStr) {
        populateBirthdateSelects();
        if (!dateStr) return;
        const [y, m, d] = dateStr.split("-").map(Number);
        document.getElementById("pBirthDay").value = d;
        document.getElementById("pBirthMonth").value = m;
        document.getElementById("pBirthYear").value = y;
      }

      function getBirthdateFromSelects() {
        const d = document.getElementById("pBirthDay").value.padStart(2, "0");
        const m = document.getElementById("pBirthMonth").value.padStart(2, "0");
        const y = document.getElementById("pBirthYear").value;
        return `${y}-${m}-${d}`;
      }

      function openProfileModal(isEdit) {
        document.getElementById("modalProfileTitle").textContent = isEdit
          ? "Editar Perfil"
          : "Configurar Perfil";
        const p = data.profile;
        populateBirthdateSelects();
        document
          .querySelectorAll("#genderSeg button")
          .forEach((b) => b.classList.remove("active"));
        if (p) {
          document.getElementById("pFirstName").value = p.firstName;
          document.getElementById("pLastName").value = p.lastName;
          setBirthdateSelects(p.birthdate);
          document.getElementById("pHeight").value = p.height;
          document.getElementById("pNeck").value = p.neck ?? "";
          document.getElementById("pWaist").value = p.waist ?? "";
          document.getElementById("pHip").value = p.hip ?? "";
          document.getElementById("pWeight").value = getCurrentWeight() ?? "";
          document
            .querySelector(`#genderSeg button[data-val="${p.gender}"]`)
            .classList.add("active");
          updateHipFieldVisibility(p.gender);
        } else {
          document.getElementById("profileForm").reset();
          setBirthdateSelects(null);
          document
            .querySelector('#genderSeg button[data-val="true"]')
            .classList.add("active");
          updateHipFieldVisibility(true);
        }
        openModal("modalProfile");
      }
      function updateHipFieldVisibility(isMale) {
        const hipField = document.getElementById("hipField");
        const row = document.getElementById("measurementsRow");
        const note = document.getElementById("measurementsNote");
        if (!hipField || !row) return;
        hipField.style.display = isMale ? "none" : "";
        row.classList.toggle("two-col", isMale);
        if (note) {
          note.textContent = isMale
            ? "Pescoço e cintura só são necessários se quiseres ver a estimativa de gordura corporal."
            : "Pescoço, cintura e anca só são necessários se quiseres ver a estimativa de gordura corporal.";
        }
      }
      document.getElementById("genderSeg").addEventListener("click", (e) => {
        if (e.target.tagName !== "BUTTON") return;
        document
          .querySelectorAll("#genderSeg button")
          .forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
        updateHipFieldVisibility(e.target.dataset.val === "true");
      });
      document.getElementById("profileForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const genderBtn = document.querySelector("#genderSeg button.active");
        const isMale = genderBtn.dataset.val === "true";
        const neckVal = parseFloat(document.getElementById("pNeck").value);
        const waistVal = parseFloat(document.getElementById("pWaist").value);
        const hipVal = parseFloat(document.getElementById("pHip").value);
        const profile = {
          firstName: document.getElementById("pFirstName").value.trim(),
          lastName: document.getElementById("pLastName").value.trim(),
          gender: isMale,
          birthdate: getBirthdateFromSelects(),
          height: parseFloat(document.getElementById("pHeight").value),
          neck: isNaN(neckVal) ? null : neckVal,
          waist: isNaN(waistVal) ? null : waistVal,
          hip: isMale ? null : isNaN(hipVal) ? null : hipVal,
        };
        data.profile = profile;
        const w = parseFloat(document.getElementById("pWeight").value);
        if (!isNaN(w)) {
          const today = new Date().toISOString().slice(0, 10);
          const existingIdx = data.weightHistory.findIndex(
            (x) => x.date === today,
          );
          if (existingIdx >= 0) data.weightHistory[existingIdx].weight = w;
          else data.weightHistory.push({ date: today, weight: w });
        }
        saveData();
        closeModal("modalProfile");
        showToast("Perfil guardado.");
        renderPerfil();
      });
      document.getElementById("weightForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const date = document.getElementById("wDate").value;
        const weight = parseFloat(document.getElementById("wWeight").value);
        const idx = data.weightHistory.findIndex((x) => x.date === date);
        if (idx >= 0) data.weightHistory[idx].weight = weight;
        else data.weightHistory.push({ date, weight });
        saveData();
        closeModal("modalWeight");
        showToast("Peso registado.");
        renderPerfil();
      });

      /* ===================== TREINOS TAB ===================== */

      function renderWorkouts() {
        const el = document.getElementById("workoutsList");
        if (!data.workouts.length) {
          el.innerHTML = `<div class="empty">
      <div class="display">Ainda sem treinos</div>
      <p>Cria o teu primeiro treino com exercícios de força e/ou cardio.</p>
    </div>`;
          return;
        }
        el.innerHTML = data.workouts
          .map((w, i) => {
            const exRows = w.exercises
              .map((ex) => {
                const warmupPrefix = ex.warmupSets ? `${ex.warmupSets}+` : "";
                const noteLine = ex.notes
                  ? `<div class="small-note" style="margin-top:2px; font-style:italic;">📝 ${ex.notes}</div>`
                  : "";
                if (ex.type === "strength") {
                  return `<div class="ex-row">
          <span class="ex-tag tag-strength">Força</span>
          <span class="ex-name">${ex.name}${noteLine}</span>
          <span class="ex-detail">${warmupPrefix}${ex.sets}x(${ex.minReps}-${ex.maxReps})</span>
        </div>`;
                } else {
                  return `<div class="ex-row">
          <span class="ex-tag tag-cardio">Cardio</span>
          <span class="ex-name">${ex.name}${noteLine}</span>
          <span class="ex-detail">${warmupPrefix}${ex.sets}x${formatMinSec(ex.duration)}${ex.distance ? ` · ${ex.distance}${ex.distanceUnit || "km"}` : ""}</span>
        </div>`;
                }
              })
              .join("");
            return `<div class="wk-card">
      <div class="wk-head">
        <div>
          <h3>${w.name}</h3>
          <div class="wk-meta">${w.exercises.length} exercício(s)</div>
        </div>
        <div class="wk-actions">
          <button class="btn btn-ghost btn-sm btn-arrow" data-up="${w.id}" ${i === 0 ? "disabled" : ""} title="Mover para cima">↑</button>
          <button class="btn btn-ghost btn-sm btn-arrow" data-down="${w.id}" ${i === data.workouts.length - 1 ? "disabled" : ""} title="Mover para baixo">↓</button>
          <button class="btn btn-strength btn-sm" data-log="${w.id}">Registar</button>
          <button class="btn btn-ghost btn-sm" data-edit="${w.id}">Editar</button>
          <button class="btn btn-danger-ghost btn-sm" data-del="${w.id}">Apagar</button>
        </div>
      </div>
      ${exRows}
    </div>`;
          })
          .join("");

        el.querySelectorAll("[data-up]").forEach((b) =>
          b.addEventListener("click", () => moveWorkout(b.dataset.up, -1)),
        );
        el.querySelectorAll("[data-down]").forEach((b) =>
          b.addEventListener("click", () => moveWorkout(b.dataset.down, 1)),
        );
        el.querySelectorAll("[data-log]").forEach((b) =>
          b.addEventListener("click", () => startSession(b.dataset.log)),
        );
        el.querySelectorAll("[data-edit]").forEach((b) =>
          b.addEventListener("click", () => editWorkout(b.dataset.edit)),
        );
        el.querySelectorAll("[data-del]").forEach((b) =>
          b.addEventListener("click", () => {
            if (confirm("Apagar este treino?")) {
              data.workouts = data.workouts.filter(
                (w) => w.id !== b.dataset.del,
              );
              saveData();
              renderWorkouts();
            }
          }),
        );
      }

      /* ---- workout builder ---- */

      let builderExercises = [];
      let editingWorkoutId = null;

      document.getElementById("newWorkoutBtn").addEventListener("click", () => {
        editingWorkoutId = null;
        builderExercises = [];
        document.getElementById("wkName").value = "";
        document.getElementById("workoutModalTitle").textContent =
          "Criar Treino";
        document.getElementById("saveWorkoutBtn").textContent =
          "Guardar treino";
        renderBuilderList();
        openModal("modalWorkout");
      });

      function moveWorkout(workoutId, delta) {
        const idx = data.workouts.findIndex((w) => w.id === workoutId);
        if (idx < 0) return;
        const newIdx = idx + delta;
        if (newIdx < 0 || newIdx >= data.workouts.length) return;
        const [item] = data.workouts.splice(idx, 1);
        data.workouts.splice(newIdx, 0, item);
        saveData();
        renderWorkouts();
      }

      function editWorkout(workoutId) {
        const workout = data.workouts.find((w) => w.id === workoutId);
        if (!workout) return;
        editingWorkoutId = workout.id;
        builderExercises = workout.exercises.map((e) => ({ ...e }));
        document.getElementById("wkName").value = workout.name;
        document.getElementById("workoutModalTitle").textContent =
          "Editar Treino";
        document.getElementById("saveWorkoutBtn").textContent =
          "Guardar alterações";
        renderBuilderList();
        openModal("modalWorkout");
      }

      function renderBuilderList() {
        const el = document.getElementById("exerciseBuilderList");
        if (!builderExercises.length) {
          el.innerHTML = `<p class="small-note" style="margin-bottom:14px;">Ainda sem exercícios. Adiciona abaixo.</p>`;
          return;
        }
        el.innerHTML = builderExercises
          .map((ex, i) => {
            const moveButtons = `<div style="position:absolute; top:8px; right:34px; display:flex; gap:4px;">
      <button class="remove-x" style="position:static;" data-upex="${i}" ${i === 0 ? "disabled" : ""} title="Mover para cima">↑</button>
      <button class="remove-x" style="position:static;" data-downex="${i}" ${i === builderExercises.length - 1 ? "disabled" : ""} title="Mover para baixo">↓</button>
    </div>`;
            if (ex.type === "strength") {
              return `<div class="exercise-builder-row">
        ${moveButtons}
        <button class="remove-x" data-rm="${i}">✕</button>
        <label>Exercício de Força</label>
        <select data-i="${i}" class="bStrengthName" style="margin-bottom:8px;">
          <option value="__custom__" ${ex.isCustom ? "selected" : ""}>+ Personalizado…</option>
          ${STRENGTH_EXERCISES.map((se) => `<option value="${se.name}" ${!ex.isCustom && se.name === ex.name ? "selected" : ""}>${se.name}</option>`).join("")}
        </select>
        <input class="bStrengthCustomName" data-i="${i}" placeholder="Nome do exercício"
          value="${ex.isCustom ? ex.name : ""}"
          style="margin-bottom:8px; display:${ex.isCustom ? "block" : "none"};">
        <div class="field-row3">
          <div><label>Séries</label><input type="number" min="1" data-i="${i}" class="bSets" value="${ex.sets}"></div>
          <div><label>Reps min</label><input type="number" min="1" data-i="${i}" class="bMinReps" value="${ex.minReps}"></div>
          <div><label>Reps max</label><input type="number" min="1" data-i="${i}" class="bMaxReps" value="${ex.maxReps}"></div>
        </div>
        <div class="field"><label>Séries de aquecimento (opcional)</label><input type="number" min="0" data-i="${i}" class="bWarmupSets" placeholder="ex: 2" value="${ex.warmupSets ?? ""}"></div>
        <div class="field"><label>Notas (opcional)</label><input data-i="${i}" class="bNotes" placeholder="ex: focar na técnica, tempo controlado..." value="${ex.notes || ""}"></div>
      </div>`;
            } else {
              return `<div class="exercise-builder-row">
        ${moveButtons}
        <button class="remove-x" data-rm="${i}">✕</button>
        <label>Exercício de Cardio</label>
        <input placeholder="Nome (ex: Corrida)" data-i="${i}" class="bCardioName" value="${ex.name}" style="margin-bottom:8px;">
        <div class="field-row">
          <div><label>Séries</label><input type="number" min="1" data-i="${i}" class="bSets" value="${ex.sets}"></div>
          <div><label>Duração (min)</label><input type="number" min="1" data-i="${i}" class="bDuration" value="${ex.duration}"></div>
        </div>
        <div class="field-row">
          <div><label>Distância (opcional)</label><input type="number" min="0" step="0.1" data-i="${i}" class="bDistance" value="${ex.distance ?? ""}"></div>
          <div><label>Unidade</label>
            <select data-i="${i}" class="bDistanceUnit">
              ${DISTANCE_UNITS.map((u) => `<option value="${u}" ${(ex.distanceUnit || "km") === u ? "selected" : ""}>${u}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field"><label>Séries de aquecimento (opcional)</label><input type="number" min="0" data-i="${i}" class="bWarmupSets" placeholder="ex: 1" value="${ex.warmupSets ?? ""}"></div>
        <div class="field"><label>Notas (opcional)</label><input data-i="${i}" class="bNotes" placeholder="ex: ritmo confortável..." value="${ex.notes || ""}"></div>
      </div>`;
            }
          })
          .join("");

        el.querySelectorAll("[data-upex]").forEach((b) =>
          b.addEventListener("click", () =>
            moveBuilderExercise(parseInt(b.dataset.upex), -1),
          ),
        );
        el.querySelectorAll("[data-downex]").forEach((b) =>
          b.addEventListener("click", () =>
            moveBuilderExercise(parseInt(b.dataset.downex), 1),
          ),
        );
        el.querySelectorAll("[data-rm]").forEach((b) =>
          b.addEventListener("click", () => {
            builderExercises.splice(parseInt(b.dataset.rm), 1);
            renderBuilderList();
          }),
        );
        el.querySelectorAll(".bStrengthName").forEach((s) =>
          s.addEventListener("change", (e) => {
            const i = parseInt(e.target.dataset.i);
            if (e.target.value === "__custom__") {
              builderExercises[i].isCustom = true;
              builderExercises[i].name = "";
              builderExercises[i].muscle = null;
            } else {
              const se = STRENGTH_EXERCISES.find(
                (x) => x.name === e.target.value,
              );
              builderExercises[i].isCustom = false;
              builderExercises[i].name = se.name;
              builderExercises[i].muscle = se.muscle;
            }
            renderBuilderList();
          }),
        );
        el.querySelectorAll(".bStrengthCustomName").forEach((inp) =>
          inp.addEventListener("input", (e) => {
            builderExercises[parseInt(e.target.dataset.i)].name =
              e.target.value;
          }),
        );
        el.querySelectorAll(".bSets").forEach((s) =>
          s.addEventListener("input", (e) => {
            builderExercises[parseInt(e.target.dataset.i)].sets =
              parseInt(e.target.value) || 1;
          }),
        );
        el.querySelectorAll(".bMinReps").forEach((s) =>
          s.addEventListener("input", (e) => {
            builderExercises[parseInt(e.target.dataset.i)].minReps =
              parseInt(e.target.value) || 1;
          }),
        );
        el.querySelectorAll(".bMaxReps").forEach((s) =>
          s.addEventListener("input", (e) => {
            builderExercises[parseInt(e.target.dataset.i)].maxReps =
              parseInt(e.target.value) || 1;
          }),
        );
        el.querySelectorAll(".bCardioName").forEach((s) =>
          s.addEventListener("input", (e) => {
            builderExercises[parseInt(e.target.dataset.i)].name =
              e.target.value;
          }),
        );
        el.querySelectorAll(".bDuration").forEach((s) =>
          s.addEventListener("input", (e) => {
            builderExercises[parseInt(e.target.dataset.i)].duration =
              parseInt(e.target.value) || 1;
          }),
        );
        el.querySelectorAll(".bWarmupSets").forEach((s) =>
          s.addEventListener("input", (e) => {
            const v = parseInt(e.target.value);
            builderExercises[parseInt(e.target.dataset.i)].warmupSets =
              isNaN(v) || v <= 0 ? null : v;
          }),
        );
        el.querySelectorAll(".bDistance").forEach((s) =>
          s.addEventListener("input", (e) => {
            const v = parseFloat(e.target.value);
            builderExercises[parseInt(e.target.dataset.i)].distance =
              isNaN(v) || v <= 0 ? null : v;
          }),
        );
        el.querySelectorAll(".bDistanceUnit").forEach((s) =>
          s.addEventListener("change", (e) => {
            builderExercises[parseInt(e.target.dataset.i)].distanceUnit =
              e.target.value;
          }),
        );
        el.querySelectorAll(".bNotes").forEach((s) =>
          s.addEventListener("input", (e) => {
            builderExercises[parseInt(e.target.dataset.i)].notes =
              e.target.value;
          }),
        );
      }

      function moveBuilderExercise(index, delta) {
        const newIndex = index + delta;
        if (newIndex < 0 || newIndex >= builderExercises.length) return;
        const [item] = builderExercises.splice(index, 1);
        builderExercises.splice(newIndex, 0, item);
        renderBuilderList();
      }

      document
        .getElementById("addStrengthBtn")
        .addEventListener("click", () => {
          const first = STRENGTH_EXERCISES[0];
          builderExercises.push({
            type: "strength",
            name: first.name,
            muscle: first.muscle,
            isCustom: false,
            minReps: 4,
            maxReps: 8,
            sets: 2,
            warmupSets: null,
            notes: "",
          });
          renderBuilderList();
        });
      document.getElementById("addCardioBtn").addEventListener("click", () => {
        builderExercises.push({
          type: "cardio",
          name: "",
          duration: 20,
          sets: 1,
          warmupSets: null,
          distance: null,
          distanceUnit: "km",
          notes: "",
        });
        renderBuilderList();
      });
      document
        .getElementById("saveWorkoutBtn")
        .addEventListener("click", () => {
          const name = document.getElementById("wkName").value.trim();
          if (!name) {
            showToast("Dá um nome ao treino.");
            return;
          }
          if (!builderExercises.length) {
            showToast("Adiciona pelo menos um exercício.");
            return;
          }
          for (const ex of builderExercises) {
            if (ex.type === "cardio" && !ex.name.trim()) {
              showToast("Preenche o nome de todos os exercícios de cardio.");
              return;
            }
            if (ex.type === "strength" && ex.isCustom && !ex.name.trim()) {
              showToast("Preenche o nome dos exercícios personalizados.");
              return;
            }
          }
          if (editingWorkoutId) {
            const idx = data.workouts.findIndex(
              (w) => w.id === editingWorkoutId,
            );
            if (idx >= 0) {
              data.workouts[idx] = {
                id: editingWorkoutId,
                name,
                exercises: builderExercises.map((e) => ({ ...e })),
              };
            }
            saveData();
            closeModal("modalWorkout");
            showToast("Treino atualizado.");
          } else {
            data.workouts.push({
              id: uid(),
              name,
              exercises: builderExercises.map((e) => ({ ...e })),
            });
            saveData();
            closeModal("modalWorkout");
            showToast("Treino criado.");
          }
          editingWorkoutId = null;
          renderWorkouts();
        });

      /* ===================== SESSION LOGGING ===================== */

      let activeSession = null;

      function getSessionDraftKey() {
        return `iron_log_session_draft_${currentUsername || "anon"}`;
      }
      function saveSessionDraft() {
        if (!activeSession) return;
        try {
          localStorage.setItem(
            getSessionDraftKey(),
            JSON.stringify(activeSession),
          );
        } catch (e) {
          console.error("Erro a guardar rascunho da sessão", e);
        }
      }
      function clearSessionDraft() {
        try {
          localStorage.removeItem(getSessionDraftKey());
        } catch (e) {}
      }
      function loadSessionDraft() {
        try {
          const raw = localStorage.getItem(getSessionDraftKey());
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      }
      function checkForSessionDraft() {
        const draft = loadSessionDraft();
        if (!draft) return;
        const label = draft.editingLogId
          ? `edição de "${draft.workoutName}"`
          : `"${draft.workoutName}"`;
        const banner = document.getElementById("draftBanner");
        document.getElementById("draftBannerText").textContent =
          `Tens um registo de treino por terminar (${label}) — provavelmente por causa de um refresh ou fecho acidental.`;
        banner.style.display = "block";

        document.getElementById("draftResumeBtn").onclick = () => {
          banner.style.display = "none";
          resumeSessionDraft(draft);
        };
        document.getElementById("draftDiscardBtn").onclick = () => {
          banner.style.display = "none";
          clearSessionDraft();
        };
      }
      function resumeSessionDraft(draft) {
        activeSession = draft;
        document.getElementById("sessionTitle").textContent =
          draft.editingLogId ? `Editar: ${draft.workoutName}` : draft.workoutName;
        document.getElementById("sessionDateField").style.display =
          draft.editingLogId ? "block" : "none";
        if (draft.editingLogId)
          document.getElementById("sessionDateInput").value = draft.date || "";
        document.getElementById("deleteLogBtn").style.display =
          draft.editingLogId ? "block" : "none";
        document.getElementById("finishSessionBtn").textContent =
          draft.editingLogId ? "Guardar alterações" : "Concluir treino";
        resetExtraExerciseForm();
        renderSession();
        openModal("modalSession");
      }

      function startSession(workoutId) {
        const workout = data.workouts.find((w) => w.id === workoutId);
        if (!workout) return;
        activeSession = {
          editingLogId: null,
          workoutId: workout.id,
          workoutName: workout.name,
          exercises: workout.exercises.map((ex) => ({
            name: ex.name,
            type: ex.type,
            muscle: ex.muscle ?? null,
            minReps: ex.minReps,
            maxReps: ex.maxReps,
            duration: ex.duration,
            targetSets: ex.sets ?? null,
            targetWarmupSets: ex.warmupSets ?? null,
            targetDistance: ex.distance ?? null,
            targetDistanceUnit: ex.distanceUnit ?? "km",
            plannedNote: ex.notes || null,
            sets: [],
          })),
        };
        document.getElementById("sessionTitle").textContent = workout.name;
        document.getElementById("sessionDateField").style.display = "none";
        document.getElementById("deleteLogBtn").style.display = "none";
        document.getElementById("finishSessionBtn").textContent =
          "Concluir treino";
        resetExtraExerciseForm();
        renderSession();
        openModal("modalSession");
      }

      function startEditLog(logId) {
        const entry = data.loggedWorkouts.find((lw) => lw.id === logId);
        if (!entry) return;
        const template = data.workouts.find((w) => w.id === entry.workoutId);

        let mergedExercises;
        if (template) {
          // Começa a partir do treino modelo, para que exercícios planeados mas não
          // registados nesse dia continuem visíveis (e possam ser preenchidos agora).
          mergedExercises = template.exercises.map((tex) => {
            const logged = entry.exercises.find(
              (ex) => ex.type === tex.type && ex.name === tex.name,
            );
            return {
              name: tex.name,
              type: tex.type,
              muscle: tex.muscle ?? null,
              minReps: tex.minReps ?? null,
              maxReps: tex.maxReps ?? null,
              duration: tex.duration ?? null,
              targetSets: tex.sets ?? null,
              targetWarmupSets: tex.warmupSets ?? null,
              targetDistance: tex.distance ?? null,
              targetDistanceUnit: tex.distanceUnit ?? "km",
              plannedNote: tex.notes || null,
              sets: logged ? [...logged.sets] : [],
            };
          });
          // Inclui exercícios que foram registados mas já não fazem parte do treino
          // modelo (ex: exercícios extra dessa sessão, ou removidos do modelo depois).
          entry.exercises.forEach((ex) => {
            const inTemplate = template.exercises.some(
              (tex) => tex.type === ex.type && tex.name === ex.name,
            );
            if (!inTemplate) {
              mergedExercises.push({
                name: ex.name,
                type: ex.type,
                muscle: ex.muscle ?? null,
                minReps: null,
                maxReps: null,
                duration: null,
                targetSets: null,
                sets: [...ex.sets],
              });
            }
          });
        } else {
          // O treino modelo já não existe — usa só o que foi registado.
          mergedExercises = entry.exercises.map((ex) => ({
            name: ex.name,
            type: ex.type,
            muscle: ex.muscle ?? null,
            minReps: null,
            maxReps: null,
            duration: null,
            targetSets: null,
            sets: [...ex.sets],
          }));
        }

        activeSession = {
          editingLogId: entry.id,
          workoutId: entry.workoutId,
          workoutName: entry.workoutName,
          date: entry.date,
          exercises: mergedExercises,
        };
        document.getElementById("sessionTitle").textContent =
          `Editar: ${entry.workoutName}`;
        document.getElementById("sessionDateField").style.display = "block";
        document.getElementById("sessionDateInput").value = entry.date;
        document.getElementById("deleteLogBtn").style.display = "block";
        document.getElementById("finishSessionBtn").textContent =
          "Guardar alterações";
        resetExtraExerciseForm();
        renderSession();
        openModal("modalSession");
      }

      const WEIGHT_UNITS = ["kg", "lb", "placas"];

      // Analisa TODO o histórico de sessões e garante que data.exercisePRs[key]
      // reflete sempre o melhor set de sempre. Nunca desce um PR já guardado —
      // só o substitui se um set registado na app o superar.
      function reconcileExercisePR(type, name) {
        if (type !== "strength") return null;
        const key = `${type}::${name}`;
        let bestWeight = 0,
          bestReps = null,
          bestUnit = "kg";
        data.loggedWorkouts.forEach((lw) => {
          lw.exercises.forEach((ex) => {
            if (ex.type === type && ex.name === name) {
              ex.sets.forEach((s) => {
                if (isWarmupSet(s)) return;
                const m = s.match(
                  /^(\d+)\s*[x×]\s*([\d.]+)\s*([a-zA-Zà-úÀ-Ú]*)/,
                );
                if (m) {
                  const reps = parseInt(m[1]),
                    w = parseFloat(m[2]);
                  if (w > bestWeight) {
                    bestWeight = w;
                    bestReps = reps;
                    bestUnit = m[3] || "kg";
                  }
                }
              });
            }
          });
        });
        const existing = data.exercisePRs[key];
        if (bestWeight > 0 && (!existing || bestWeight > existing.weight)) {
          data.exercisePRs[key] = {
            weight: bestWeight,
            reps: bestReps,
            unit: bestUnit,
          };
          saveData();
        }
        return data.exercisePRs[key] || null;
      }

      function showExerciseHistory(type, name) {
        document.getElementById("exerciseHistoryTitle").textContent = name;
        const el = document.getElementById("exerciseHistoryList");

        const pr = reconcileExercisePR(type, name);

        const rows = [];
        [...data.loggedWorkouts]
          .filter(
            (lw) => !(activeSession && lw.id === activeSession.editingLogId),
          )
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .forEach((lw) => {
            if (rows.length >= 5) return;
            // junta todos os sets deste exercício dentro do MESMO treino num só registo
            const matching = lw.exercises.filter(
              (e) => e.type === type && e.name === name,
            );
            if (matching.length) {
              rows.push({
                date: lw.date,
                sets: matching.flatMap((e) => e.sets),
              });
            }
          });

        const prHtml = pr
          ? `
    <div class="card" style="margin-bottom:14px; border-color: color-mix(in srgb, var(--gold) 45%, var(--border));">
      <div class="card-title">PR</div>
      <div style="display:flex; align-items:baseline; gap:8px;">
        <span class="display" style="font-size:24px; color:var(--gold);">${pr.weight} ${pr.unit}</span>
        ${pr.reps ? `<span style="color:var(--muted); font-size:13px;">@ ${pr.reps} reps</span>` : ""}
      </div>
    </div>`
          : "";

        const rowsHtml = rows.length
          ? rows
              .map(
                (r) => `
      <div class="log-item">
        <div class="log-item-head"><span class="name">${formatDate(r.date)}</span></div>
        <div class="log-item-ex">${r.sets.join(", ")}</div>
      </div>`,
              )
              .join("")
          : `<p class="small-note">Ainda sem registos anteriores para este exercício.</p>`;

        el.innerHTML = prHtml + rowsHtml;

        openModal("modalExerciseHistory");
      }

      const DISTANCE_UNITS = ["km", "mi", "m"];

      function isWarmupSet(s) {
        return s.startsWith("Aquecimento: ");
      }

      // Extrai {totalMinutes, distance, unit} de um registo de cardio tipo
      // "20min 30s 5km" — totalMinutes já inclui os segundos como fração.
      function parseCardioSet(s) {
        const m = s.match(/^(\d+)min(?:\s+(\d+)s)?(?:\s+([\d.]+)(km|mi|m))?/);
        if (!m) return null;
        const minutes = parseInt(m[1]) || 0;
        const seconds = m[2] ? parseInt(m[2]) : 0;
        return {
          totalMinutes: minutes + seconds / 60,
          distance: m[3] ? parseFloat(m[3]) : null,
          unit: m[4] || null,
        };
      }
      function formatMinSec(totalMinutes) {
        const mins = Math.floor(totalMinutes);
        const secs = Math.round((totalMinutes - mins) * 60);
        return secs > 0
          ? `${mins}:${String(secs).padStart(2, "0")} min`
          : `${mins} min`;
      }

      function renderSession() {
        saveSessionDraft();
        const el = document.getElementById("sessionExerciseList");
        el.innerHTML = activeSession.exercises
          .map((ex, i) => {
            const setsHtml = ex.sets
              .map(
                (s, si) =>
                  `<span class="set-chip">${s}<button data-rmset="${i}:${si}">✕</button></span>`,
              )
              .join("");
            const warmupCheckbox = `<label style="display:flex; align-items:center; gap:6px; margin-top:8px; font-size:12px; color:var(--muted);">
        <input type="checkbox" class="setWarmup" data-ex="${i}" style="width:auto;">
        Série de aquecimento (não conta para o progresso/PR)
      </label>`;
            const inputRow =
              ex.type === "strength"
                ? `<div class="set-input-row">
          <input type="number" placeholder="Reps" class="setReps" data-ex="${i}" min="1">
          <input type="number" placeholder="Peso" class="setWeight" data-ex="${i}" min="0" step="0.5">
          <select class="setUnit" data-ex="${i}">
            ${WEIGHT_UNITS.map((u) => `<option value="${u}">${u}</option>`).join("")}
            <option value="__custom__">Outra…</option>
          </select>
        </div>
        <input class="setUnitCustom" data-ex="${i}" placeholder="Unidade personalizada" style="display:none; margin-top:8px;">
        <input class="setNotes" data-ex="${i}" placeholder="Notas (RIR, microload...) — opcional" style="margin-top:8px;">
        ${warmupCheckbox}
        <button class="btn btn-strength btn-block" data-addset="${i}" style="margin-top:8px;">+ Adicionar série</button>`
                : `<div class="set-input-row">
          <input type="number" placeholder="Minutos" class="setMinutes" data-ex="${i}" min="0">
          <input type="number" placeholder="Segundos" class="setSeconds" data-ex="${i}" min="0" max="59">
        </div>
        <div class="set-input-row" style="margin-top:8px;">
          <input type="number" placeholder="Distância — opcional" class="setDistance" data-ex="${i}" min="0" step="0.1">
          <select class="setDistanceUnit" data-ex="${i}">
            ${DISTANCE_UNITS.map((u) => `<option value="${u}">${u}</option>`).join("")}
          </select>
        </div>
        <input class="setNotesCardio" data-ex="${i}" placeholder="Notas — opcional" style="margin-top:8px;">
        ${warmupCheckbox}
        <button class="btn btn-cardio btn-block" data-addset="${i}" style="margin-top:8px;">+ Adicionar série</button>`;
            let targetNote;
            const warmupPrefix = ex.targetWarmupSets
              ? `${ex.targetWarmupSets}+`
              : "";
            if (ex.type === "strength") {
              targetNote =
                ex.minReps != null
                  ? `Alvo: ${warmupPrefix}${ex.targetSets ?? "?"}x(${ex.minReps}-${ex.maxReps} reps)`
                  : "Exercício extra";
            } else {
              targetNote =
                ex.duration != null
                  ? `Alvo: ${warmupPrefix}${ex.targetSets ?? "?"}x${formatMinSec(ex.duration)}${ex.targetDistance ? ` · ${ex.targetDistance}${ex.targetDistanceUnit || "km"}` : ""}`
                  : "Exercício extra";
            }
            const workingCount = ex.sets.filter((s) => !isWarmupSet(s)).length;
            const warmupCount = ex.sets.filter((s) => isWarmupSet(s)).length;
            let progressNote = ex.targetSets
              ? ` · ${workingCount}/${ex.targetSets} feitas`
              : workingCount
                ? ` · ${workingCount} feita(s)`
                : "";
            if (ex.targetWarmupSets)
              progressNote += ` · aquecimento ${warmupCount}/${ex.targetWarmupSets}`;
            else if (warmupCount)
              progressNote += ` · ${warmupCount} aquecimento`;
            return `<div class="session-ex">
      <div class="session-ex-head">
        <span class="ex-tag ${ex.type === "strength" ? "tag-strength" : "tag-cardio"}">${ex.type === "strength" ? "Força" : "Cardio"}</span>
        <strong style="flex:1; margin-left:8px;">${ex.name}</strong>
        <button class="remove-x" style="position:static;" data-rmex="${i}" title="Remover exercício">✕</button>
      </div>
      <div class="small-note">${targetNote}${progressNote}</div>
      ${ex.plannedNote ? `<div class="small-note" style="font-style:italic;">📝 ${ex.plannedNote}</div>` : ""}
      <button class="btn btn-ghost btn-sm" data-history="${i}" type="button" style="margin:8px 0 4px;">📊 ${ex.type === "strength" ? "Últimos pesos" : "Últimos registos"}</button>
      <div>${setsHtml}</div>
      ${inputRow}
    </div>`;
          })
          .join("");

        el.querySelectorAll("[data-history]").forEach((b) =>
          b.addEventListener("click", () => {
            const ex = activeSession.exercises[parseInt(b.dataset.history)];
            showExerciseHistory(ex.type, ex.name);
          }),
        );

        el.querySelectorAll(".setUnit").forEach((sel) =>
          sel.addEventListener("change", (e) => {
            const i = e.target.dataset.ex;
            const customInput = el.querySelector(
              `.setUnitCustom[data-ex="${i}"]`,
            );
            customInput.style.display =
              e.target.value === "__custom__" ? "block" : "none";
          }),
        );

        el.querySelectorAll("[data-addset]").forEach((b) =>
          b.addEventListener("click", () => {
            const i = parseInt(b.dataset.addset);
            const ex = activeSession.exercises[i];
            if (ex.type === "strength") {
              const repsInput = el.querySelector(`.setReps[data-ex="${i}"]`);
              const weightInput = el.querySelector(
                `.setWeight[data-ex="${i}"]`,
              );
              const unitSelect = el.querySelector(`.setUnit[data-ex="${i}"]`);
              const unitCustom = el.querySelector(
                `.setUnitCustom[data-ex="${i}"]`,
              );
              const notesInput = el.querySelector(`.setNotes[data-ex="${i}"]`);
              const warmupInput = el.querySelector(
                `.setWarmup[data-ex="${i}"]`,
              );
              const reps = parseInt(repsInput.value),
                weight = parseFloat(weightInput.value) || 0;
              if (!reps || reps < 1) {
                showToast("Indica as repetições.");
                return;
              }
              let unit = unitSelect.value;
              if (unit === "__custom__") {
                unit = unitCustom.value.trim();
                if (!unit) {
                  showToast("Indica a unidade personalizada.");
                  return;
                }
              }
              const notes = notesInput.value.trim();
              const prefix =
                warmupInput && warmupInput.checked ? "Aquecimento: " : "";
              ex.sets.push(
                `${prefix}${reps} × ${weight} ${unit}${notes ? ` (${notes})` : ""}`,
              );
            } else {
              const minInput = el.querySelector(`.setMinutes[data-ex="${i}"]`);
              const secInput = el.querySelector(`.setSeconds[data-ex="${i}"]`);
              const distInput = el.querySelector(
                `.setDistance[data-ex="${i}"]`,
              );
              const distUnitSelect = el.querySelector(
                `.setDistanceUnit[data-ex="${i}"]`,
              );
              const notesInput = el.querySelector(
                `.setNotesCardio[data-ex="${i}"]`,
              );
              const warmupInput = el.querySelector(
                `.setWarmup[data-ex="${i}"]`,
              );
              const minutes = parseInt(minInput.value) || 0;
              const seconds = parseInt(secInput.value) || 0;
              if (minutes <= 0 && seconds <= 0) {
                showToast("Indica a duração (minutos e/ou segundos).");
                return;
              }
              const dist = parseFloat(distInput.value);
              const distUnit = distUnitSelect ? distUnitSelect.value : "km";
              const notes = notesInput.value.trim();
              const prefix =
                warmupInput && warmupInput.checked ? "Aquecimento: " : "";
              const timePart = `${minutes}min${seconds > 0 ? ` ${seconds}s` : ""}`;
              ex.sets.push(
                `${prefix}${timePart}${!isNaN(dist) && dist > 0 ? ` ${dist}${distUnit}` : ""}${notes ? ` (${notes})` : ""}`,
              );
            }
            renderSession();
          }),
        );
        el.querySelectorAll("[data-rmset]").forEach((b) =>
          b.addEventListener("click", () => {
            const [i, si] = b.dataset.rmset.split(":").map(Number);
            activeSession.exercises[i].sets.splice(si, 1);
            renderSession();
          }),
        );
        el.querySelectorAll("[data-rmex]").forEach((b) =>
          b.addEventListener("click", () => {
            const i = parseInt(b.dataset.rmex);
            const ex = activeSession.exercises[i];
            if (
              ex.sets.length > 0 &&
              !confirm(
                "Remover este exercício e todas as séries registadas nele?",
              )
            )
              return;
            activeSession.exercises.splice(i, 1);
            renderSession();
          }),
        );
      }

      /* ---- exercício extra (fora do programa) ---- */

      (function populateExtraExerciseSelect() {
        const sel = document.getElementById("extraExStrengthSelect");
        sel.innerHTML =
          `<option value="__custom__">+ Personalizado…</option>` +
          STRENGTH_EXERCISES.map(
            (se) => `<option value="${se.name}">${se.name}</option>`,
          ).join("");
      })();

      function resetExtraExerciseForm() {
        document
          .querySelectorAll("#extraExTypeSeg button")
          .forEach((b) =>
            b.classList.toggle("active", b.dataset.val === "strength"),
          );
        document.getElementById("extraExStrengthField").style.display = "block";
        document.getElementById("extraExCardioField").style.display = "none";
        document.getElementById("extraExStrengthSelect").value = "__custom__";
        document.getElementById("extraExCustomName").value = "";
        document.getElementById("extraExCustomName").style.display = "block";
        document.getElementById("extraExCardioName").value = "";
      }

      document
        .getElementById("extraExTypeSeg")
        .addEventListener("click", (e) => {
          if (e.target.tagName !== "BUTTON") return;
          document
            .querySelectorAll("#extraExTypeSeg button")
            .forEach((b) => b.classList.remove("active"));
          e.target.classList.add("active");
          const val = e.target.dataset.val;
          document.getElementById("extraExStrengthField").style.display =
            val === "strength" ? "block" : "none";
          document.getElementById("extraExCardioField").style.display =
            val === "cardio" ? "block" : "none";
        });
      document
        .getElementById("extraExStrengthSelect")
        .addEventListener("change", (e) => {
          document.getElementById("extraExCustomName").style.display =
            e.target.value === "__custom__" ? "block" : "none";
        });
      document
        .getElementById("addExtraExerciseBtn")
        .addEventListener("click", () => {
          if (!activeSession) return;
          const typeVal = document.querySelector(
            "#extraExTypeSeg button.active",
          ).dataset.val;
          if (typeVal === "strength") {
            const sel = document.getElementById("extraExStrengthSelect");
            let name, muscle;
            if (sel.value === "__custom__") {
              name = document.getElementById("extraExCustomName").value.trim();
              muscle = null;
              if (!name) {
                showToast("Escreve o nome do exercício.");
                return;
              }
            } else {
              const se = STRENGTH_EXERCISES.find((x) => x.name === sel.value);
              name = se.name;
              muscle = se.muscle;
            }
            activeSession.exercises.push({
              name,
              type: "strength",
              muscle,
              minReps: null,
              maxReps: null,
              duration: null,
              targetSets: null,
              sets: [],
            });
          } else {
            const name = document
              .getElementById("extraExCardioName")
              .value.trim();
            if (!name) {
              showToast("Escreve o nome do exercício.");
              return;
            }
            activeSession.exercises.push({
              name,
              type: "cardio",
              muscle: null,
              minReps: null,
              maxReps: null,
              duration: null,
              targetSets: null,
              sets: [],
            });
          }
          resetExtraExerciseForm();
          renderSession();
          showToast("Exercício adicionado à sessão.");
        });

      document
        .getElementById("finishSessionBtn")
        .addEventListener("click", () => {
          const hasAnySet = activeSession.exercises.some(
            (ex) => ex.sets.length > 0,
          );
          if (!hasAnySet) {
            showToast("Regista pelo menos uma série.");
            return;
          }
          const cleanExercises = activeSession.exercises
            .filter((ex) => ex.sets.length > 0)
            .map((ex) => ({
              name: ex.name,
              type: ex.type,
              muscle: ex.muscle ?? null,
              sets: [...ex.sets],
            }));

          if (activeSession.editingLogId) {
            const idx = data.loggedWorkouts.findIndex(
              (lw) => lw.id === activeSession.editingLogId,
            );
            if (idx >= 0) {
              const dateVal =
                document.getElementById("sessionDateInput").value ||
                data.loggedWorkouts[idx].date;
              data.loggedWorkouts[idx] = {
                id: activeSession.editingLogId,
                workoutId: activeSession.workoutId,
                workoutName: activeSession.workoutName,
                date: dateVal,
                exercises: cleanExercises,
              };
            }
            saveData();
            closeModal("modalSession");
            activeSession = null;
            clearSessionDraft();
            showToast("Treino atualizado!");
            renderHistorico();
          } else {
            data.loggedWorkouts.push({
              id: uid(),
              workoutId: activeSession.workoutId,
              workoutName: activeSession.workoutName,
              date: new Date().toISOString().slice(0, 10),
              exercises: cleanExercises,
            });
            saveData();
            closeModal("modalSession");
            activeSession = null;
            clearSessionDraft();
            showToast("Treino registado!");
            renderWorkouts();
          }
        });

      document.getElementById("deleteLogBtn").addEventListener("click", () => {
        if (!activeSession || !activeSession.editingLogId) return;
        if (
          !confirm(
            "Apagar este treino registado? Esta ação não pode ser desfeita.",
          )
        )
          return;
        data.loggedWorkouts = data.loggedWorkouts.filter(
          (lw) => lw.id !== activeSession.editingLogId,
        );
        saveData();
        closeModal("modalSession");
        activeSession = null;
        clearSessionDraft();
        showToast("Treino apagado.");
        renderHistorico();
      });

      /* ===================== CALORIAS TAB (BETA) ===================== */

      let selectedCalorieDate = new Date().toISOString().slice(0, 10);

      let caloriasSubTab = "diario";

      function renderCaloriasTab() {
        const el = document.getElementById("caloriasContent");
        el.innerHTML = `
    <div class="seg" id="caloriasSubSeg" style="margin-bottom:18px;">
      <button type="button" data-val="diario" class="${caloriasSubTab === "diario" ? "active" : ""}">Diário</button>
      <button type="button" data-val="planos" class="${caloriasSubTab === "planos" ? "active" : ""}">Planos Alimentares</button>
    </div>
    <div id="caloriasSubContent"></div>
  `;
        document
          .getElementById("caloriasSubSeg")
          .addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            caloriasSubTab = btn.dataset.val;
            renderCaloriasTab();
          });
        if (caloriasSubTab === "diario") renderCaloriasDiario();
        else renderCaloriasPlanos();
      }

      function updateMacroGoalCaloriesNote() {
        const note = document.getElementById("macroGoalCaloriesNote");
        if (!note) return;
        const p = parseFloat(document.getElementById("protGoalInput").value);
        const c = parseFloat(document.getElementById("carbGoalInput").value);
        const f = parseFloat(document.getElementById("fatGoalInput").value);
        const g = parseFloat(document.getElementById("calGoalInput").value);
        const hasAny = !isNaN(p) || !isNaN(c) || !isNaN(f);
        if (!hasAny) {
          note.textContent = "";
          return;
        }
        // Proteína e hidratos ≈ 4 kcal/g, gordura ≈ 9 kcal/g
        const kcalFromMacros = Math.round(
          (isNaN(p) ? 0 : p) * 4 + (isNaN(c) ? 0 : c) * 4 + (isNaN(f) ? 0 : f) * 9,
        );
        let msg = `Estes macros correspondem a ≈ ${kcalFromMacros} kcal.`;
        if (!isNaN(g) && g > 0) {
          const diff = kcalFromMacros - g;
          if (Math.abs(diff) > 15) {
            msg +=
              diff > 0
                ? ` Isso é ${diff} kcal acima da meta de calorias que definiste.`
                : ` Isso é ${Math.abs(diff)} kcal abaixo da meta de calorias que definiste.`;
          } else {
            msg += " Está alinhado com a tua meta de calorias.";
          }
        }
        note.textContent = msg;
      }

      function macroBarHtml(label, value, goalVal, colorVar) {
        const p = goalVal
          ? Math.max(0, Math.min(100, (value / goalVal) * 100))
          : 0;
        return `
    <div style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--muted); margin-bottom:4px;">
        <span>${label}</span><span>${Math.round(value)}g${goalVal ? ` / ${goalVal}g` : ""}</span>
      </div>
      <div class="muscle-bar-track"><div class="muscle-bar-fill" style="width:${p}%; background:${colorVar};"></div></div>
    </div>`;
      }

      function renderCaloriasDiario() {
        const el = document.getElementById("caloriasSubContent");
        const entries = data.calorieEntries.filter(
          (e) => e.date === selectedCalorieDate,
        );
        const total = entries.reduce((sum, e) => sum + e.calories, 0);
        const totalProt = entries.reduce((sum, e) => sum + (e.protein || 0), 0);
        const totalCarb = entries.reduce((sum, e) => sum + (e.carbs || 0), 0);
        const totalFat = entries.reduce((sum, e) => sum + (e.fat || 0), 0);
        const goal = data.calorieGoal;
        const mg = data.macroGoals || {};
        const pct = goal ? Math.max(0, Math.min(100, (total / goal) * 100)) : 0;

        el.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:16px;">
        <button class="btn btn-ghost btn-sm" id="calPrevDay">← Anterior</button>
        <input type="date" id="calDateInput" value="${selectedCalorieDate}" style="max-width:170px; text-align:center;">
        <button class="btn btn-ghost btn-sm" id="calNextDay">Seguinte →</button>
      </div>
      <div style="display:flex; align-items:baseline; gap:8px;">
        <span class="display" style="font-size:34px; color:var(--gold);">${total}</span>
        <span style="color:var(--muted); font-size:12px;">kcal registadas${goal ? ` de ${goal} kcal` : ""}</span>
      </div>
      ${
        goal
          ? `
        <div class="muscle-bar-track" style="margin-top:10px;">
          <div class="muscle-bar-fill" style="width:${pct}%; background:var(--gold);"></div>
        </div>
        <div class="small-note">${total <= goal ? `Faltam ${goal - total} kcal para a meta.` : `${total - goal} kcal acima da meta.`}</div>
      `
          : `<div class="small-note">Define metas (opcionais) mais abaixo.</div>`
      }
    </div>

    <div class="card" style="margin-bottom:14px;">
      <div class="card-title">Macros do dia</div>
      ${macroBarHtml("Proteína", totalProt, mg.protein, "var(--strength)")}
      ${macroBarHtml("Hidratos", totalCarb, mg.carbs, "var(--cardio)")}
      ${macroBarHtml("Gordura", totalFat, mg.fat, "var(--gold)")}
    </div>

    <div class="card" style="margin-bottom:14px;">
      <div class="card-title">Metas (opcionais)</div>
      <div class="field-row">
        <div class="field"><label>Calorias</label><input type="number" min="0" id="calGoalInput" placeholder="ex: 2200" value="${goal ?? ""}"></div>
        <div class="field"><label>Proteína (g)</label><input type="number" min="0" id="protGoalInput" placeholder="ex: 150" value="${mg.protein ?? ""}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Hidratos (g)</label><input type="number" min="0" id="carbGoalInput" placeholder="ex: 220" value="${mg.carbs ?? ""}"></div>
        <div class="field"><label>Gordura (g)</label><input type="number" min="0" id="fatGoalInput" placeholder="ex: 70" value="${mg.fat ?? ""}"></div>
      </div>
      <p class="small-note" id="macroGoalCaloriesNote" style="margin-top:-6px; margin-bottom:12px;"></p>
      <button class="btn btn-ghost btn-block" id="calGoalSaveBtn">Guardar metas</button>
    </div>

    <div class="card" style="margin-bottom:14px;">
      <div class="card-title">Registo Rápido</div>
      <div class="field-row">
        <div class="field"><label>Alimento / refeição</label><input id="calEntryName" placeholder="Ex: Almoço"></div>
        <div class="field"><label>Calorias (kcal)</label><input type="number" min="0" id="calEntryCalories" placeholder="Ex: 650"></div>
      </div>
      <div class="field-row3">
        <div><label>Proteína (g)</label><input type="number" min="0" id="calEntryProt" placeholder="opcional"></div>
        <div><label>Hidratos (g)</label><input type="number" min="0" id="calEntryCarb" placeholder="opcional"></div>
        <div><label>Gordura (g)</label><input type="number" min="0" id="calEntryFat" placeholder="opcional"></div>
      </div>
      <button class="btn btn-strength btn-block" id="calAddBtn">+ Adicionar</button>
    </div>

    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px;">
      <button class="btn btn-ghost btn-sm" id="openFoodSearchBtn" type="button">🔍 Pesquisar Alimento</button>
      <button class="btn btn-ghost btn-sm" id="openAddMealBtn" type="button">🍽️ Refeição de um Plano</button>
    </div>

    <div id="calEntriesList"></div>
  `;

        document.getElementById("calEntriesList").innerHTML = entries.length
          ? entries
              .map((e) => {
                const details = [];
                if (e.protein || e.carbs || e.fat)
                  details.push(
                    `P:${Math.round(e.protein || 0)}g H:${Math.round(e.carbs || 0)}g G:${Math.round(e.fat || 0)}g`,
                  );
                if (e.sourceMeal) details.push(`via ${e.sourceMeal}`);
                return `
      <div class="log-item">
        <div class="log-item-head">
          <span class="name">${e.name}</span>
          <span class="date mono">${e.calories} kcal</span>
        </div>
        ${details.length ? `<div class="log-item-ex">${details.join(" · ")}</div>` : ""}
        <div style="margin-top:8px;">
          <button class="btn btn-danger-ghost btn-sm" data-delcal="${e.id}">Apagar</button>
        </div>
      </div>`;
              })
              .join("")
          : `<p class="small-note">Ainda sem registos neste dia.</p>`;

        document
          .getElementById("calPrevDay")
          .addEventListener("click", () => shiftCalorieDate(-1));
        document
          .getElementById("calNextDay")
          .addEventListener("click", () => shiftCalorieDate(1));
        document
          .getElementById("calDateInput")
          .addEventListener("change", (e) => {
            if (!e.target.value) return;
            selectedCalorieDate = e.target.value;
            renderCaloriasDiario();
          });
        ["protGoalInput", "carbGoalInput", "fatGoalInput", "calGoalInput"].forEach(
          (id) => {
            document
              .getElementById(id)
              .addEventListener("input", updateMacroGoalCaloriesNote);
          },
        );
        updateMacroGoalCaloriesNote();
        document
          .getElementById("calGoalSaveBtn")
          .addEventListener("click", () => {
            const v = parseFloat(document.getElementById("calGoalInput").value);
            data.calorieGoal = isNaN(v) || v <= 0 ? null : Math.round(v);
            const pv = parseFloat(
              document.getElementById("protGoalInput").value,
            );
            const cv = parseFloat(
              document.getElementById("carbGoalInput").value,
            );
            const fv = parseFloat(
              document.getElementById("fatGoalInput").value,
            );
            data.macroGoals = {
              protein: isNaN(pv) || pv <= 0 ? null : Math.round(pv),
              carbs: isNaN(cv) || cv <= 0 ? null : Math.round(cv),
              fat: isNaN(fv) || fv <= 0 ? null : Math.round(fv),
            };
            saveData();
            showToast("Metas guardadas.");
            renderCaloriasDiario();
          });
        document.getElementById("calAddBtn").addEventListener("click", () => {
          const name = document.getElementById("calEntryName").value.trim();
          const cal = parseFloat(
            document.getElementById("calEntryCalories").value,
          );
          if (!name) {
            showToast("Escreve o nome do alimento.");
            return;
          }
          if (isNaN(cal) || cal < 0) {
            showToast("Indica as calorias.");
            return;
          }
          const prot = parseFloat(
            document.getElementById("calEntryProt").value,
          );
          const carb = parseFloat(
            document.getElementById("calEntryCarb").value,
          );
          const fat = parseFloat(document.getElementById("calEntryFat").value);
          data.calorieEntries.push({
            id: uid(),
            date: selectedCalorieDate,
            name,
            calories: Math.round(cal),
            protein: isNaN(prot) ? null : prot,
            carbs: isNaN(carb) ? null : carb,
            fat: isNaN(fat) ? null : fat,
          });
          saveData();
          showToast("Registado.");
          renderCaloriasDiario();
        });
        document.querySelectorAll("[data-delcal]").forEach((b) =>
          b.addEventListener("click", () => {
            data.calorieEntries = data.calorieEntries.filter(
              (e) => e.id !== b.dataset.delcal,
            );
            saveData();
            renderCaloriasDiario();
          }),
        );
        document
          .getElementById("openFoodSearchBtn")
          .addEventListener("click", () => openFoodPicker("diario"));
        document
          .getElementById("openAddMealBtn")
          .addEventListener("click", () => openAddMealToDay());
      }

      /* ---- Planos Alimentares ---- */

      function renderCaloriasPlanos() {
        const el = document.getElementById("caloriasSubContent");
        el.innerHTML = `
    <button class="btn btn-strength" id="newMealPlanBtn" style="margin-bottom:18px;">+ Criar plano alimentar</button>
    <div id="mealPlansList"></div>
  `;
        document
          .getElementById("newMealPlanBtn")
          .addEventListener("click", () => openMealPlanBuilder(null));

        const listEl = document.getElementById("mealPlansList");
        if (!data.mealPlans.length) {
          listEl.innerHTML = `<div class="empty">
      <div class="display">Ainda sem planos</div>
      <p>Cria um plano alimentar com as tuas refeições habituais para as adicionares rapidamente ao dia.</p>
    </div>`;
          return;
        }

        listEl.innerHTML = data.mealPlans
          .map((plan) => {
            const mealsHtml = plan.meals
              .map((meal) => {
                const t = computeMealTotals(meal);
                return `<div class="ex-row">
        <span class="ex-name">${meal.name}</span>
        <span class="ex-detail">${meal.foods.length} alimento(s) · ${t.calories} kcal · P:${t.protein}g H:${t.carbs}g G:${t.fat}g</span>
      </div>`;
              })
              .join("");
            return `<div class="wk-card">
      <div class="wk-head">
        <div>
          <h3>${plan.name}</h3>
          <div class="wk-meta">${plan.meals.length} refeição(ões)</div>
        </div>
        <div class="wk-actions">
          <button class="btn btn-ghost btn-sm" data-editplan="${plan.id}">Editar</button>
          <button class="btn btn-danger-ghost btn-sm" data-delplan="${plan.id}">Apagar</button>
        </div>
      </div>
      ${mealsHtml}
    </div>`;
          })
          .join("");

        listEl
          .querySelectorAll("[data-editplan]")
          .forEach((b) =>
            b.addEventListener("click", () =>
              openMealPlanBuilder(b.dataset.editplan),
            ),
          );
        listEl.querySelectorAll("[data-delplan]").forEach((b) =>
          b.addEventListener("click", () => {
            if (confirm("Apagar este plano alimentar?")) {
              data.mealPlans = data.mealPlans.filter(
                (p) => p.id !== b.dataset.delplan,
              );
              saveData();
              renderCaloriasPlanos();
            }
          }),
        );
      }

      let mealPlanBuilderMeals = [];
      let editingMealPlanId = null;
      let activeMealBuilderIndex = null;

      function openMealPlanBuilder(planId) {
        if (planId) {
          const plan = data.mealPlans.find((p) => p.id === planId);
          if (!plan) return;
          editingMealPlanId = plan.id;
          mealPlanBuilderMeals = plan.meals.map((m) => ({
            id: m.id,
            name: m.name,
            foods: m.foods.map((f) => ({ ...f, per100: { ...f.per100 } })),
          }));
          document.getElementById("mealPlanName").value = plan.name;
          document.getElementById("mealPlanModalTitle").textContent =
            "Editar Plano Alimentar";
        } else {
          editingMealPlanId = null;
          mealPlanBuilderMeals = [];
          document.getElementById("mealPlanName").value = "";
          document.getElementById("mealPlanModalTitle").textContent =
            "Criar Plano Alimentar";
        }
        renderMealPlanBuilder();
        openModal("modalMealPlan");
      }

      function renderMealPlanBuilder() {
        const el = document.getElementById("mealPlanMealsList");
        if (!mealPlanBuilderMeals.length) {
          el.innerHTML = `<p class="small-note" style="margin-bottom:14px;">Ainda sem refeições. Adiciona abaixo.</p>`;
        } else {
          el.innerHTML = mealPlanBuilderMeals
            .map((meal, mi) => {
              const foodsHtml = meal.foods
                .map((f, fi) => {
                  const t = computeFoodTotals(f);
                  return `<div class="ex-row">
          <span class="ex-name">${f.name}${f.brand ? ` <span style="color:var(--muted); font-weight:400;">(${f.brand})</span>` : ""}</span>
          <span class="ex-detail">${f.quantity}g · ${t.calories} kcal · P:${t.protein}g H:${t.carbs}g G:${t.fat}g</span>
          <button class="remove-x" style="position:static;" data-rmfood="${mi}:${fi}">✕</button>
        </div>`;
                })
                .join("");
              const mealTotals = computeMealTotals(meal);
              const moveMealButtons = `<div style="position:absolute; top:8px; right:34px; display:flex; gap:4px;">
        <button class="remove-x" style="position:static;" data-upmeal="${mi}" ${mi === 0 ? "disabled" : ""} title="Mover para cima">↑</button>
        <button class="remove-x" style="position:static;" data-downmeal="${mi}" ${mi === mealPlanBuilderMeals.length - 1 ? "disabled" : ""} title="Mover para baixo">↓</button>
      </div>`;
              return `<div class="exercise-builder-row">
        ${moveMealButtons}
        <button class="remove-x" data-rmmeal="${mi}">✕</button>
        <div class="field"><label>Nome da refeição</label><input class="mealNameInput" data-mi="${mi}" value="${meal.name}" placeholder="Ex: Pequeno-almoço"></div>
        ${meal.foods.length ? `<p class="small-note" style="margin-bottom:8px;">Total: ${mealTotals.calories} kcal · P:${mealTotals.protein}g H:${mealTotals.carbs}g G:${mealTotals.fat}g</p>` : ""}
        ${foodsHtml}
        <button class="btn btn-ghost btn-block" data-addfood="${mi}" type="button" style="margin-top:8px;">+ Adicionar alimento</button>
      </div>`;
            })
            .join("");
        }

        el.querySelectorAll(".mealNameInput").forEach((inp) =>
          inp.addEventListener("input", (e) => {
            mealPlanBuilderMeals[parseInt(e.target.dataset.mi)].name =
              e.target.value;
          }),
        );
        el.querySelectorAll("[data-upmeal]").forEach((b) =>
          b.addEventListener("click", () =>
            moveMealBuilder(parseInt(b.dataset.upmeal), -1),
          ),
        );
        el.querySelectorAll("[data-downmeal]").forEach((b) =>
          b.addEventListener("click", () =>
            moveMealBuilder(parseInt(b.dataset.downmeal), 1),
          ),
        );
        el.querySelectorAll("[data-rmmeal]").forEach((b) =>
          b.addEventListener("click", () => {
            mealPlanBuilderMeals.splice(parseInt(b.dataset.rmmeal), 1);
            renderMealPlanBuilder();
          }),
        );
        el.querySelectorAll("[data-rmfood]").forEach((b) =>
          b.addEventListener("click", () => {
            const [mi, fi] = b.dataset.rmfood.split(":").map(Number);
            mealPlanBuilderMeals[mi].foods.splice(fi, 1);
            renderMealPlanBuilder();
          }),
        );
        el.querySelectorAll("[data-addfood]").forEach((b) =>
          b.addEventListener("click", () => {
            activeMealBuilderIndex = parseInt(b.dataset.addfood);
            openFoodPicker("planFood");
          }),
        );
      }

      function moveMealBuilder(index, delta) {
        const newIndex = index + delta;
        if (newIndex < 0 || newIndex >= mealPlanBuilderMeals.length) return;
        const [item] = mealPlanBuilderMeals.splice(index, 1);
        mealPlanBuilderMeals.splice(newIndex, 0, item);
        renderMealPlanBuilder();
      }

      function computeFoodTotals(f) {
        const factor = f.quantity / 100;
        return {
          calories: Math.round(f.per100.calories * factor),
          protein: Math.round(f.per100.protein * factor * 10) / 10,
          carbs: Math.round(f.per100.carbs * factor * 10) / 10,
          fat: Math.round(f.per100.fat * factor * 10) / 10,
        };
      }
      function computeMealTotals(meal) {
        const acc = meal.foods.reduce(
          (acc, f) => {
            const t = computeFoodTotals(f);
            acc.calories += t.calories;
            acc.protein += t.protein;
            acc.carbs += t.carbs;
            acc.fat += t.fat;
            return acc;
          },
          { calories: 0, protein: 0, carbs: 0, fat: 0 },
        );
        return {
          calories: Math.round(acc.calories),
          protein: Math.round(acc.protein * 10) / 10,
          carbs: Math.round(acc.carbs * 10) / 10,
          fat: Math.round(acc.fat * 10) / 10,
        };
      }

      document.getElementById("addMealBtn").addEventListener("click", () => {
        mealPlanBuilderMeals.push({ id: uid(), name: "", foods: [] });
        renderMealPlanBuilder();
      });

      document
        .getElementById("saveMealPlanBtn")
        .addEventListener("click", () => {
          const name = document.getElementById("mealPlanName").value.trim();
          if (!name) {
            showToast("Dá um nome ao plano.");
            return;
          }
          if (!mealPlanBuilderMeals.length) {
            showToast("Adiciona pelo menos uma refeição.");
            return;
          }
          for (const meal of mealPlanBuilderMeals) {
            if (!meal.name.trim()) {
              showToast("Dá um nome a todas as refeições.");
              return;
            }
          }
          const mealsToSave = mealPlanBuilderMeals.map((m) => ({
            id: m.id,
            name: m.name,
            foods: m.foods.map((f) => ({ ...f, per100: { ...f.per100 } })),
          }));
          if (editingMealPlanId) {
            const idx = data.mealPlans.findIndex(
              (p) => p.id === editingMealPlanId,
            );
            if (idx >= 0)
              data.mealPlans[idx] = {
                id: editingMealPlanId,
                name,
                meals: mealsToSave,
              };
            saveData();
            closeModal("modalMealPlan");
            showToast("Plano atualizado.");
          } else {
            data.mealPlans.push({ id: uid(), name, meals: mealsToSave });
            saveData();
            closeModal("modalMealPlan");
            showToast("Plano criado.");
          }
          editingMealPlanId = null;
          renderCaloriasPlanos();
        });

      /* ---- Food Picker (pesquisa Open Food Facts + manual) ---- */

      let foodPickerTarget = null; // 'diario' | 'planFood'
      let selectedFoodPer100 = null;

      function openFoodPicker(target) {
        foodPickerTarget = target;
        selectedFoodPer100 = null;
        document.getElementById("foodSearchInput").value = "";
        document.getElementById("foodSearchResults").innerHTML = "";
        document.getElementById("foodSearchStatus").textContent = "";
        document.getElementById("foodManualSection").style.display = "none";
        document.getElementById("foodManualName").value = "";
        document.getElementById("foodManualCal").value = "";
        document.getElementById("foodManualProt").value = "";
        document.getElementById("foodManualCarb").value = "";
        document.getElementById("foodManualFat").value = "";
        document.getElementById("foodQuantitySection").style.display = "none";
        document.getElementById("foodQuantityInput").value = "100";
        openModal("modalFoodPicker");
      }

      async function searchOpenFoodFacts(query) {
        const url = `${API_BASE}/off-search?q=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        console.log("Open Food Facts — resposta bruta:", json);

        const rawHits = Array.isArray(json.hits)
          ? json.hits
          : Array.isArray(json.hits?.hits)
            ? json.hits.hits
            : Array.isArray(json.products)
              ? json.products
              : [];

        const results = [];
        for (const h of rawHits) {
          try {
            const p = h._source || h;
            const name =
              p.product_name || p.product_name_pt || p.product_name_en;
            const n = p.nutriments || {};
            const kcal =
              n["energy-kcal_100g"] ?? n["energy-kcal_value"] ?? null;
            if (!name || kcal == null) continue;
            results.push({
              name,
              brand: Array.isArray(p.brands)
                ? p.brands[0] || ""
                : (p.brands || "").split(",")[0].trim(),
              calories: Math.round(kcal),
              protein: Math.round((n["proteins_100g"] || 0) * 10) / 10,
              carbs: Math.round((n["carbohydrates_100g"] || 0) * 10) / 10,
              fat: Math.round((n["fat_100g"] || 0) * 10) / 10,
            });
          } catch (itemErr) {
            console.warn(
              "Item de pesquisa ignorado (formato inesperado):",
              h,
              itemErr,
            );
          }
        }
        return results.slice(0, 15);
      }

      document
        .getElementById("foodSearchBtn")
        .addEventListener("click", async () => {
          const query = document.getElementById("foodSearchInput").value.trim();
          if (!query) {
            showToast("Escreve algo para pesquisar.");
            return;
          }
          const statusEl = document.getElementById("foodSearchStatus");
          const resultsEl = document.getElementById("foodSearchResults");
          statusEl.textContent = "A pesquisar...";
          resultsEl.innerHTML = "";
          try {
            const results = await searchOpenFoodFacts(query);
            if (!results.length) {
              statusEl.textContent =
                "Sem resultados. Tenta outro termo ou adiciona manualmente.";
              return;
            }
            statusEl.textContent = `${results.length} resultado(s) — valores por 100g, toca para escolher:`;
            resultsEl.innerHTML = results
              .map(
                (r, i) => `
      <div class="log-item" style="cursor:pointer;" data-pickfood="${i}">
        <div class="log-item-head">
          <span class="name">${r.name}</span>
          <span class="date mono">${r.calories} kcal</span>
        </div>
        <div class="log-item-ex">${r.brand ? r.brand + " · " : ""}P:${r.protein}g H:${r.carbs}g G:${r.fat}g /100g</div>
      </div>
    `,
              )
              .join("");
            resultsEl.querySelectorAll("[data-pickfood]").forEach((elm) =>
              elm.addEventListener("click", () => {
                selectFood(results[parseInt(elm.dataset.pickfood)]);
              }),
            );
          } catch (err) {
            console.error("Erro na pesquisa Open Food Facts:", err);
            statusEl.textContent = `Não foi possível interpretar a resposta (${err.message || "erro desconhecido"}). Abre a consola do browser para detalhes, ou adiciona manualmente.`;
          }
        });

      document
        .getElementById("foodManualToggleBtn")
        .addEventListener("click", () => {
          const sec = document.getElementById("foodManualSection");
          sec.style.display = sec.style.display === "none" ? "block" : "none";
        });

      document
        .getElementById("foodManualUseBtn")
        .addEventListener("click", () => {
          const name = document.getElementById("foodManualName").value.trim();
          const cal = parseFloat(
            document.getElementById("foodManualCal").value,
          );
          const prot =
            parseFloat(document.getElementById("foodManualProt").value) || 0;
          const carb =
            parseFloat(document.getElementById("foodManualCarb").value) || 0;
          const fat =
            parseFloat(document.getElementById("foodManualFat").value) || 0;
          if (!name) {
            showToast("Escreve o nome do alimento.");
            return;
          }
          if (isNaN(cal) || cal < 0) {
            showToast("Indica as calorias por 100g.");
            return;
          }
          document.getElementById("foodManualSection").style.display = "none";
          selectFood({
            name,
            brand: "",
            calories: cal,
            protein: prot,
            carbs: carb,
            fat: fat,
          });
        });

      function selectFood(food) {
        selectedFoodPer100 = food;
        document.getElementById("selectedFoodName").textContent = food.brand
          ? `${food.name} (${food.brand})`
          : food.name;
        document.getElementById("foodQuantitySection").style.display = "block";
        document.getElementById("foodQuantityInput").value = "100";
        updateFoodPreview();
      }

      document
        .getElementById("foodQuantityInput")
        .addEventListener("input", updateFoodPreview);

      function updateFoodPreview() {
        if (!selectedFoodPer100) return;
        const qty =
          parseFloat(document.getElementById("foodQuantityInput").value) || 0;
        const factor = qty / 100;
        const cal = Math.round(selectedFoodPer100.calories * factor);
        const prot = Math.round(selectedFoodPer100.protein * factor * 10) / 10;
        const carb = Math.round(selectedFoodPer100.carbs * factor * 10) / 10;
        const fat = Math.round(selectedFoodPer100.fat * factor * 10) / 10;
        document.getElementById("foodComputedPreview").textContent =
          `≈ ${cal} kcal · Proteína ${prot}g · Hidratos ${carb}g · Gordura ${fat}g`;
      }

      document
        .getElementById("foodConfirmAddBtn")
        .addEventListener("click", () => {
          if (!selectedFoodPer100) {
            showToast("Seleciona ou define um alimento primeiro.");
            return;
          }
          const qty = parseFloat(
            document.getElementById("foodQuantityInput").value,
          );
          if (isNaN(qty) || qty <= 0) {
            showToast("Indica uma quantidade válida.");
            return;
          }
          const factor = qty / 100;

          if (foodPickerTarget === "diario") {
            data.calorieEntries.push({
              id: uid(),
              date: selectedCalorieDate,
              name: selectedFoodPer100.name,
              calories: Math.round(selectedFoodPer100.calories * factor),
              protein:
                Math.round(selectedFoodPer100.protein * factor * 10) / 10,
              carbs: Math.round(selectedFoodPer100.carbs * factor * 10) / 10,
              fat: Math.round(selectedFoodPer100.fat * factor * 10) / 10,
            });
            saveData();
            closeModal("modalFoodPicker");
            showToast("Adicionado.");
            renderCaloriasDiario();
          } else if (foodPickerTarget === "planFood") {
            if (
              activeMealBuilderIndex == null ||
              !mealPlanBuilderMeals[activeMealBuilderIndex]
            ) {
              closeModal("modalFoodPicker");
              return;
            }
            mealPlanBuilderMeals[activeMealBuilderIndex].foods.push({
              id: uid(),
              name: selectedFoodPer100.name,
              brand: selectedFoodPer100.brand || "",
              quantity: qty,
              per100: {
                calories: selectedFoodPer100.calories,
                protein: selectedFoodPer100.protein,
                carbs: selectedFoodPer100.carbs,
                fat: selectedFoodPer100.fat,
              },
            });
            closeModal("modalFoodPicker");
            renderMealPlanBuilder();
          }
        });

      /* ---- Adicionar refeição de um plano ao dia ---- */

      function openAddMealToDay() {
        if (!data.mealPlans.length) {
          showToast("Ainda não tens nenhum plano alimentar criado.");
          return;
        }
        const planSelect = document.getElementById("addMealPlanSelect");
        planSelect.innerHTML = data.mealPlans
          .map((p) => `<option value="${p.id}">${p.name}</option>`)
          .join("");
        planSelect.onchange = populateAddMealMealSelect;
        document.getElementById("addMealMealSelect").onchange =
          updateAddMealPreview;
        populateAddMealMealSelect();
        openModal("modalAddMealToDay");
      }

      function populateAddMealMealSelect() {
        const planId = document.getElementById("addMealPlanSelect").value;
        const plan = data.mealPlans.find((p) => p.id === planId);
        const mealSelect = document.getElementById("addMealMealSelect");
        mealSelect.innerHTML = (plan ? plan.meals : [])
          .map(
            (m) =>
              `<option value="${m.id}">${m.name} (${m.foods.length} alimentos)</option>`,
          )
          .join("");
        updateAddMealPreview();
      }

      function updateAddMealPreview() {
        const planId = document.getElementById("addMealPlanSelect").value;
        const plan = data.mealPlans.find((p) => p.id === planId);
        const mealId = document.getElementById("addMealMealSelect").value;
        const meal = plan ? plan.meals.find((m) => m.id === mealId) : null;
        const previewEl = document.getElementById("addMealPreview");
        if (!meal) {
          previewEl.textContent = "";
          return;
        }
        const totalKcal = meal.foods.reduce(
          (s, f) => s + Math.round((f.per100.calories * f.quantity) / 100),
          0,
        );
        previewEl.textContent = meal.foods.length
          ? `${meal.foods.map((f) => f.name).join(", ")} · ≈ ${totalKcal} kcal`
          : "Esta refeição ainda não tem alimentos.";
      }

      document
        .getElementById("addMealConfirmBtn")
        .addEventListener("click", () => {
          const planId = document.getElementById("addMealPlanSelect").value;
          const plan = data.mealPlans.find((p) => p.id === planId);
          const mealId = document.getElementById("addMealMealSelect").value;
          const meal = plan ? plan.meals.find((m) => m.id === mealId) : null;
          if (!meal || !meal.foods.length) {
            showToast("Esta refeição não tem alimentos.");
            return;
          }
          meal.foods.forEach((f) => {
            const factor = f.quantity / 100;
            data.calorieEntries.push({
              id: uid(),
              date: selectedCalorieDate,
              name: f.name,
              calories: Math.round(f.per100.calories * factor),
              protein: Math.round(f.per100.protein * factor * 10) / 10,
              carbs: Math.round(f.per100.carbs * factor * 10) / 10,
              fat: Math.round(f.per100.fat * factor * 10) / 10,
              sourceMeal: `${plan.name} — ${meal.name}`,
            });
          });
          saveData();
          closeModal("modalAddMealToDay");
          showToast("Refeição adicionada.");
          renderCaloriasDiario();
        });

      function shiftCalorieDate(delta) {
        const d = new Date(selectedCalorieDate + "T00:00:00");
        d.setDate(d.getDate() + delta);
        selectedCalorieDate = d.toISOString().slice(0, 10);
        renderCaloriasDiario();
      }

      /* ===================== PROGRESSO TAB ===================== */

      let progressSelected = "__weight__";
      let progressoSubTab = "peso";

      function getExerciseOptions() {
        const map = new Map();
        data.loggedWorkouts.forEach((lw) => {
          lw.exercises.forEach((ex) => {
            const key = `${ex.type}::${ex.name}`;
            if (!map.has(key))
              map.set(key, { key, type: ex.type, name: ex.name });
          });
        });
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
      }

      function renderProgresso() {
        const el = document.getElementById("progressoContent");
        el.innerHTML = `
    <div class="seg" id="progressoSubSeg" style="margin-bottom:18px;">
      <button type="button" data-val="peso" class="${progressoSubTab === "peso" ? "active" : ""}">Peso &amp; Treinos</button>
      <button type="button" data-val="calorias" class="${progressoSubTab === "calorias" ? "active" : ""}">Nutrição</button>
    </div>
    <div id="progressoSubContent"></div>
  `;
        document
          .getElementById("progressoSubSeg")
          .addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            progressoSubTab = btn.dataset.val;
            renderProgresso();
          });

        if (progressoSubTab === "peso") renderProgressoPeso();
        else renderProgressoCalorias();
      }

      function renderProgressoPeso() {
        const el = document.getElementById("progressoSubContent");
        const exOptions = getExerciseOptions();
        const hasWeight = data.weightHistory.length > 0;

        if (!hasWeight && !exOptions.length) {
          el.innerHTML = `<div class="empty">
      <div class="display">Ainda sem dados</div>
      <p>Regista pesos no Perfil ou conclui treinos para veres aqui a tua evolução.</p>
    </div>`;
          return;
        }

        const options = [];
        if (hasWeight)
          options.push({ key: "__weight__", label: "Peso Corporal" });
        exOptions.forEach((o) =>
          options.push({
            key: o.key,
            label: `${o.name} ${o.type === "strength" ? "(Força)" : "(Cardio)"}`,
          }),
        );

        if (!options.find((o) => o.key === progressSelected))
          progressSelected = options[0].key;

        el.innerHTML = `
    <div class="card">
      <div class="field" style="margin-bottom:12px;">
        <label>Métrica</label>
        <select id="progressSelect">
          ${options.map((o) => `<option value="${o.key}" ${o.key === progressSelected ? "selected" : ""}>${o.label}</option>`).join("")}
        </select>
      </div>
      <canvas id="progressChart" height="140" style="width:100%;"></canvas>
      <p class="small-note" id="progressAxisNote" style="margin-top:6px;"></p>
    </div>
    <div id="exercisePrSection"></div>
    <div id="progressTable" class="section-gap"></div>
  `;

        document
          .getElementById("progressSelect")
          .addEventListener("change", (e) => {
            updateProgressView(e.target.value);
          });

        updateProgressView(progressSelected);
      }

      function renderProgressoCalorias() {
        const el = document.getElementById("progressoSubContent");
        if (!data.calorieEntries.length) {
          el.innerHTML = `<div class="empty">
      <div class="display">Ainda sem registos de calorias</div>
      <p>Regista refeições na tab Nutrição para veres aqui a evolução diária.</p>
    </div>`;
          return;
        }

        el.innerHTML = `
    <div class="card">
      <div class="card-title">Total diário de calorias</div>
      <canvas id="caloriesProgressChart" height="140" style="width:100%;"></canvas>
      <p class="small-note">Soma simples das calorias registadas por dia. Mantida separada do peso de propósito, já que são medidas diferentes.</p>
    </div>
    <div id="caloriesProgressTable" class="section-gap"></div>
  `;

        const totals = {};
        data.calorieEntries.forEach((e) => {
          totals[e.date] = (totals[e.date] || 0) + e.calories;
        });
        const points = Object.entries(totals)
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        drawLineChart(
          document.getElementById("caloriesProgressChart"),
          points,
          "--gold",
        );

        const rows = points
          .slice()
          .reverse()
          .map(
            (p) => `
    <div class="log-item">
      <div class="log-item-head"><span class="name">Total do dia</span><span class="date">${formatDate(p.date)}</span></div>
      <div class="log-item-ex">${p.value} kcal</div>
    </div>`,
          )
          .join("");
        document.getElementById("caloriesProgressTable").innerHTML =
          rows || `<p class="small-note">Ainda sem registos suficientes.</p>`;
      }

      function updateProgressView(key) {
        progressSelected = key;
        const canvas = document.getElementById("progressChart");
        const tableEl = document.getElementById("progressTable");
        if (!canvas || !tableEl) return;

        let points = [];
        let rowsHtml = "";

        if (key === "__weight__") {
          const sorted = [...data.weightHistory].sort(
            (a, b) => new Date(a.date) - new Date(b.date),
          );
          points = sorted.map((p) => ({ date: p.date, value: p.weight }));
          rowsHtml = sorted
            .slice()
            .reverse()
            .map(
              (p) => `
      <div class="log-item">
        <div class="log-item-head"><span class="name">Peso Corporal</span><span class="date">${formatDate(p.date)}</span></div>
        <div class="log-item-ex">${p.weight} kg</div>
      </div>`,
            )
            .join("");
          const prContainerWeight =
            document.getElementById("exercisePrSection");
          if (prContainerWeight) prContainerWeight.innerHTML = "";
          drawWeightWeeklyChart(canvas, points);
          tableEl.innerHTML = points.length
            ? rowsHtml
            : `<p class="small-note">Ainda sem registos suficientes.</p>`;
          const axisNoteWeight = document.getElementById("progressAxisNote");
          if (axisNoteWeight)
            axisNoteWeight.textContent = "Eixo vertical: peso corporal (kg).";
          return;
        } else {
          const [type, name] = key.split("::");
          const sessions = [];

          // Para cardio: só usamos ritmo (tempo por unidade de distância) se houver
          // pelo menos uma série (não-aquecimento) com distância registada para
          // este exercício; caso contrário mantemos a duração como métrica.
          let cardioPaceMode = false;
          let cardioPaceUnit = "km";
          if (type === "cardio") {
            data.loggedWorkouts.forEach((lw) => {
              lw.exercises.forEach((ex) => {
                if (ex.type === type && ex.name === name) {
                  ex.sets.forEach((s) => {
                    if (isWarmupSet(s)) return;
                    const parsed = parseCardioSet(s);
                    if (parsed && parsed.distance != null)
                      cardioPaceMode = true;
                  });
                }
              });
            });
          }

          [...data.loggedWorkouts]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .forEach((lw) => {
              lw.exercises.forEach((ex) => {
                if (ex.type === type && ex.name === name) {
                  if (type === "strength") {
                    let bestWeight = 0,
                      bestReps = 0,
                      bestUnit = "kg";
                    ex.sets.forEach((s) => {
                      if (isWarmupSet(s)) return;
                      const m = s.match(
                        /^(\d+)\s*[x×]\s*([\d.]+)\s*([a-zA-Zà-úÀ-Ú]*)/,
                      );
                      if (m) {
                        const reps = parseInt(m[1]),
                          w = parseFloat(m[2]);
                        if (w >= bestWeight) {
                          bestWeight = w;
                          bestReps = reps;
                          bestUnit = m[3] || "kg";
                        }
                      }
                    });
                    if (bestWeight > 0)
                      sessions.push({
                        date: lw.date,
                        value: bestWeight,
                        detail: `Melhor série: ${bestReps} reps @ ${bestWeight}${bestUnit} · Todas: ${ex.sets.join(", ")}`,
                      });
                  } else if (cardioPaceMode) {
                    let bestPace = null,
                      bestUnitHere = cardioPaceUnit;
                    ex.sets.forEach((s) => {
                      if (isWarmupSet(s)) return;
                      const parsed = parseCardioSet(s);
                      if (parsed && parsed.distance > 0) {
                        const pace = parsed.totalMinutes / parsed.distance;
                        if (bestPace === null || pace < bestPace) {
                          bestPace = Math.round(pace * 100) / 100;
                          bestUnitHere = parsed.unit || bestUnitHere;
                        }
                      }
                    });
                    if (bestPace !== null) {
                      cardioPaceUnit = bestUnitHere;
                      sessions.push({
                        date: lw.date,
                        value: bestPace,
                        detail: `Melhor ritmo: ${bestPace} min/${bestUnitHere} · Todas: ${ex.sets.join(", ")}`,
                      });
                    }
                  } else {
                    let bestDur = 0;
                    ex.sets.forEach((s) => {
                      if (isWarmupSet(s)) return;
                      const parsed = parseCardioSet(s);
                      if (parsed && parsed.totalMinutes > bestDur)
                        bestDur = parsed.totalMinutes;
                    });
                    if (bestDur > 0)
                      sessions.push({
                        date: lw.date,
                        value: Math.round(bestDur * 100) / 100,
                        detail: `Melhor série: ${formatMinSec(bestDur)} · Todas: ${ex.sets.join(", ")}`,
                      });
                  }
                }
              });
            });
          points = sessions.map((s) => ({ date: s.date, value: s.value }));
          rowsHtml = sessions
            .slice()
            .reverse()
            .map(
              (s) => `
      <div class="log-item">
        <div class="log-item-head"><span class="name">${name}</span><span class="date">${formatDate(s.date)}</span></div>
        <div class="log-item-ex">${s.detail}</div>
      </div>`,
            )
            .join("");

          const axisNote = document.getElementById("progressAxisNote");
          if (axisNote) {
            if (type === "strength")
              axisNote.textContent =
                "Eixo vertical: peso da melhor série (ignora aquecimentos).";
            else if (cardioPaceMode)
              axisNote.textContent = `Eixo vertical: ritmo (min/${cardioPaceUnit}) — valores mais baixos são melhores. Ignora aquecimentos.`;
            else
              axisNote.textContent =
                "Eixo vertical: duração da série (min). Regista a distância para veres o ritmo aqui.";
          }

          const prContainer = document.getElementById("exercisePrSection");
          if (prContainer) {
            if (type === "strength") {
              reconcileExercisePR(type, name);
              renderExercisePrSection(key);
            } else {
              prContainer.innerHTML = "";
            }
          }
        }

        drawLineChart(canvas, points);
        tableEl.innerHTML = points.length
          ? rowsHtml
          : `<p class="small-note">Ainda sem registos suficientes.</p>`;
      }

      function renderExercisePrSection(key) {
        const container = document.getElementById("exercisePrSection");
        if (!container) return;
        const existing = data.exercisePRs[key];

        container.innerHTML = `
    <div class="card" style="margin-top:14px;">
      <div class="card-title">PR (Recorde Pessoal)</div>
      ${
        existing
          ? `<div style="display:flex; align-items:baseline; gap:8px; margin-bottom:10px;">
             <span class="display" style="font-size:28px; color:var(--gold);">${existing.weight} ${existing.unit}</span>
             ${existing.reps ? `<span style="color:var(--muted); font-size:13px;">@ ${existing.reps} reps</span>` : ""}
           </div>`
          : `<div class="small-note" style="margin-bottom:10px;">Ainda sem PR registado.</div>`
      }
      <p class="small-note" style="margin-top:0; margin-bottom:10px;">Podes definir/corrigir aqui manualmente (ex: um recorde anterior à app). Depois disso, atualiza-se sozinho sempre que uma série registada na app o superar.</p>
      <div class="field-row3">
        <div><label>Reps (opcional)</label><input type="number" min="1" id="prRepsInput" placeholder="Ex: 5" value="${existing && existing.reps ? existing.reps : ""}"></div>
        <div><label>Peso</label><input type="number" min="0" step="0.5" id="prWeightInput" placeholder="Peso" value="${existing ? existing.weight : ""}"></div>
        <div><label>Unidade</label>
          <select id="prUnitInput">
            ${WEIGHT_UNITS.map((u) => `<option value="${u}" ${existing && existing.unit === u ? "selected" : ""}>${u}</option>`).join("")}
          </select>
        </div>
      </div>
      <button class="btn btn-ghost btn-block" id="prSaveBtn" style="margin-top:8px;">Guardar PR</button>
    </div>
  `;

        document.getElementById("prSaveBtn").addEventListener("click", () => {
          const w = parseFloat(document.getElementById("prWeightInput").value);
          const unit = document.getElementById("prUnitInput").value;
          const repsVal = parseInt(
            document.getElementById("prRepsInput").value,
          );
          const reps = !isNaN(repsVal) && repsVal > 0 ? repsVal : null;
          if (isNaN(w) || w <= 0) {
            showToast("Indica um peso válido.");
            return;
          }
          data.exercisePRs[key] = { weight: w, unit, reps };
          saveData();
          showToast("PR guardado.");
          updateProgressView(key);
        });
      }

      /* ===================== AMIGOS TAB ===================== */

      let socialState = {
        friends: [],
        incoming: [],
        outgoing: [],
        notifications: [],
        sharedWorkoutsInbox: [],
      };

      async function apiSocialGet() {
        const res = await fetch(`${API_BASE}/social`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro");
        return json;
      }
      async function apiFriendsSearch(q) {
        const res = await fetch(
          `${API_BASE}/friends-search?q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${authToken}` } },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro");
        return json.results;
      }
      async function apiFriendsAction(payload) {
        const res = await fetch(`${API_BASE}/friends-action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro");
        return json;
      }

      async function loadSocialState() {
        try {
          socialState = await apiSocialGet();
        } catch (e) {
          console.error("Erro ao carregar estado social:", e);
        }
        updateFriendsBadge();
      }
      function updateFriendsBadge() {
        const total = socialState.notifications.length + socialState.incoming.length;
        const badge = document.getElementById("friendsBadge");
        if (badge) {
          badge.style.display = total > 0 ? "block" : "none";
        }
      }

      async function renderAmigosTab() {
        await loadSocialState();
        const el = document.getElementById("amigosContent");

        const incomingHtml = socialState.incoming.length
          ? `<div class="card" style="margin-bottom:14px;">
              <div class="card-title">Pedidos de amizade</div>
              ${socialState.incoming
                .map(
                  (r) => `
                <div class="ex-row">
                  <span class="ex-name">${r.displayName}</span>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-strength btn-sm" data-accept="${r.username}">Aceitar</button>
                    <button class="btn btn-danger-ghost btn-sm" data-reject="${r.username}">Recusar</button>
                  </div>
                </div>`,
                )
                .join("")}
            </div>`
          : "";

        const notifHtml = socialState.notifications.length
          ? `<div class="card" style="margin-bottom:14px;">
              <div class="card-title">Notificações
                <button class="btn btn-ghost btn-sm" id="clearAllNotifBtn">Limpar todas</button>
              </div>
              ${socialState.notifications
                .slice(0, 20)
                .map(
                  (n) => `
                <div class="log-item">
                  <div class="log-item-head">
                    <span class="log-item-ex" style="margin-top:0;">${n.message}</span>
                    <button class="remove-x" style="position:static;" data-dismiss-notif="${n.id}" title="Dispensar">✕</button>
                  </div>
                  <div class="small-note">${formatDate(n.createdAt.slice(0, 10))}</div>
                </div>`,
                )
                .join("")}
            </div>`
          : "";

        const sharedHtml = socialState.sharedWorkoutsInbox.length
          ? `<div class="card" style="margin-bottom:14px;">
              <div class="card-title">Treinos partilhados contigo</div>
              ${socialState.sharedWorkoutsInbox
                .map(
                  (s) => `
                <div class="wk-card">
                  <div class="wk-head">
                    <div><h3>${s.workout.name}</h3><div class="wk-meta">de ${s.fromDisplayName}</div></div>
                  </div>
                  <div style="display:flex; gap:8px; margin-top:8px;">
                    <button class="btn btn-strength btn-sm" data-import-shared="${s.id}">+ Adicionar aos meus treinos</button>
                    <button class="btn btn-ghost btn-sm" data-dismiss-shared="${s.id}">Dispensar</button>
                  </div>
                </div>`,
                )
                .join("")}
            </div>`
          : "";

        const friendsHtml = socialState.friends.length
          ? socialState.friends
              .map(
                (f) => `
              <div class="ex-row">
                <span class="ex-name">${f.displayName}</span>
                <div style="display:flex; gap:6px;">
                  <button class="btn btn-ghost btn-sm" data-share="${f.username}">Partilhar treino</button>
                  <button class="btn btn-danger-ghost btn-sm" data-unfriend="${f.username}">Remover</button>
                </div>
              </div>`,
              )
              .join("")
          : `<p class="small-note">Ainda sem amigos. Pesquisa um nome de utilizador acima.</p>`;

        const outgoingNote = socialState.outgoing.length
          ? `<p class="small-note">Pedidos enviados, a aguardar resposta: ${socialState.outgoing.join(", ")}</p>`
          : "";

        el.innerHTML = `
          <div class="card" style="margin-bottom:14px;">
            <div class="card-title">Adicionar amigo</div>
            <div class="field-row">
              <input id="friendSearchInput" placeholder="Nome de utilizador">
              <button class="btn btn-ghost" id="friendSearchBtn" type="button">Pesquisar</button>
            </div>
            <div id="friendSearchResults"></div>
            ${outgoingNote}
          </div>
          ${incomingHtml}
          ${notifHtml}
          ${sharedHtml}
          <div class="card">
            <div class="card-title">Os teus amigos</div>
            ${friendsHtml}
          </div>
        `;

        document
          .getElementById("friendSearchBtn")
          .addEventListener("click", async () => {
            const q = document
              .getElementById("friendSearchInput")
              .value.trim();
            const resultsEl = document.getElementById("friendSearchResults");
            if (q.length < 2) {
              showToast("Escreve pelo menos 2 caracteres.");
              return;
            }
            try {
              const results = await apiFriendsSearch(q);
              const known = new Set([
                ...socialState.friends.map((f) => f.username),
                ...socialState.outgoing,
              ]);
              resultsEl.innerHTML = results.length
                ? results
                    .map(
                      (r) => `
                  <div class="ex-row">
                    <span class="ex-name">${r.displayName}</span>
                    ${
                      known.has(r.username)
                        ? `<span class="small-note">já amigo(a) ou pedido enviado</span>`
                        : `<button class="btn btn-strength btn-sm" data-addfriend="${r.username}">+ Adicionar</button>`
                    }
                  </div>`,
                    )
                    .join("")
                : `<p class="small-note">Sem resultados.</p>`;
              resultsEl
                .querySelectorAll("[data-addfriend]")
                .forEach((b) =>
                  b.addEventListener("click", async () => {
                    try {
                      await apiFriendsAction({
                        action: "request",
                        targetUsername: b.dataset.addfriend,
                      });
                      showToast("Pedido enviado.");
                      renderAmigosTab();
                    } catch (e) {
                      showToast(e.message);
                    }
                  }),
                );
            } catch (e) {
              showToast(e.message);
            }
          });

        el.querySelectorAll("[data-accept]").forEach((b) =>
          b.addEventListener("click", async () => {
            try {
              await apiFriendsAction({
                action: "respond",
                fromUsername: b.dataset.accept,
                accept: true,
              });
              showToast("Pedido aceite.");
              renderAmigosTab();
            } catch (e) {
              showToast(e.message);
            }
          }),
        );
        el.querySelectorAll("[data-reject]").forEach((b) =>
          b.addEventListener("click", async () => {
            try {
              await apiFriendsAction({
                action: "respond",
                fromUsername: b.dataset.reject,
                accept: false,
              });
              renderAmigosTab();
            } catch (e) {
              showToast(e.message);
            }
          }),
        );
        el.querySelectorAll("[data-unfriend]").forEach((b) =>
          b.addEventListener("click", async () => {
            if (!confirm("Remover este amigo?")) return;
            try {
              await apiFriendsAction({
                action: "remove",
                username: b.dataset.unfriend,
              });
              renderAmigosTab();
            } catch (e) {
              showToast(e.message);
            }
          }),
        );
        el.querySelectorAll("[data-share]").forEach((b) =>
          b.addEventListener("click", () =>
            openShareWorkoutModal(b.dataset.share),
          ),
        );
        el.querySelectorAll("[data-import-shared]").forEach((b) =>
          b.addEventListener("click", async () => {
            const shared = socialState.sharedWorkoutsInbox.find(
              (s) => s.id === b.dataset.importShared,
            );
            if (!shared) return;
            const imported = { ...shared.workout, id: uid() };
            data.workouts.push(imported);
            saveData();
            try {
              await apiFriendsAction({
                action: "dismiss-shared-workout",
                id: shared.id,
              });
            } catch (e) {}
            showToast("Treino adicionado aos teus treinos.");
            renderAmigosTab();
          }),
        );
        el.querySelectorAll("[data-dismiss-shared]").forEach((b) =>
          b.addEventListener("click", async () => {
            try {
              await apiFriendsAction({
                action: "dismiss-shared-workout",
                id: b.dataset.dismissShared,
              });
              renderAmigosTab();
            } catch (e) {
              showToast(e.message);
            }
          }),
        );
        el.querySelectorAll("[data-dismiss-notif]").forEach((b) =>
          b.addEventListener("click", async () => {
            try {
              await apiFriendsAction({
                action: "dismiss-notification",
                id: b.dataset.dismissNotif,
              });
              renderAmigosTab();
            } catch (e) {
              showToast(e.message);
            }
          }),
        );
        const clearAllBtn = document.getElementById("clearAllNotifBtn");
        if (clearAllBtn) {
          clearAllBtn.addEventListener("click", async () => {
            try {
              await apiFriendsAction({ action: "clear-notifications" });
              renderAmigosTab();
            } catch (e) {
              showToast(e.message);
            }
          });
        }
      }

      function openShareWorkoutModal(friendUsername) {
        const friend = socialState.friends.find(
          (f) => f.username === friendUsername,
        );
        document.getElementById("shareWorkoutTarget").textContent = friend
          ? `A partilhar com ${friend.displayName}:`
          : "";
        const listEl = document.getElementById("shareWorkoutList");
        if (!data.workouts.length) {
          listEl.innerHTML = `<p class="small-note">Ainda não tens nenhum treino criado.</p>`;
        } else {
          listEl.innerHTML = data.workouts
            .map(
              (w) => `
            <div class="ex-row">
              <span class="ex-name">${w.name}</span>
              <button class="btn btn-strength btn-sm" data-do-share="${w.id}">Partilhar</button>
            </div>`,
            )
            .join("");
          listEl.querySelectorAll("[data-do-share]").forEach((b) =>
            b.addEventListener("click", async () => {
              const workout = data.workouts.find(
                (w) => w.id === b.dataset.doShare,
              );
              if (!workout) return;
              try {
                await apiFriendsAction({
                  action: "share-workout",
                  friendUsername,
                  workout,
                });
                showToast("Treino partilhado.");
                closeModal("modalShareWorkout");
              } catch (e) {
                showToast(e.message);
              }
            }),
          );
        }
        openModal("modalShareWorkout");
      }

      /* ===================== HISTORICO TAB ===================== */

      function renderHistorico() {
        const el = document.getElementById("historicoContent");
        if (!data.loggedWorkouts.length) {
          el.innerHTML = `<div class="empty">
      <div class="display">Sem treinos registados</div>
      <p>Regista uma sessão a partir de um treino para veres o histórico aqui.</p>
    </div>`;
          return;
        }
        const sorted = [...data.loggedWorkouts].sort(
          (a, b) => new Date(b.date) - new Date(a.date),
        );
        const logsHtml = sorted
          .map((lw) => {
            const exSummary = lw.exercises
              .map((ex) => `${ex.name}: ${ex.sets.join(", ")}`)
              .join(" · ");
            return `<div class="log-item">
      <div class="log-item-head">
        <span class="name">${lw.workoutName}</span>
        <span class="date">${formatDate(lw.date)}</span>
      </div>
      <div class="log-item-ex">${exSummary}</div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn btn-ghost btn-sm" data-editlog="${lw.id}">Editar</button>
        <button class="btn btn-danger-ghost btn-sm" data-dellog="${lw.id}">Apagar</button>
      </div>
    </div>`;
          })
          .join("");

        el.innerHTML = logsHtml;

        el.querySelectorAll("[data-editlog]").forEach((b) =>
          b.addEventListener("click", () => startEditLog(b.dataset.editlog)),
        );
        el.querySelectorAll("[data-dellog]").forEach((b) =>
          b.addEventListener("click", () => {
            if (confirm("Apagar este treino registado?")) {
              data.loggedWorkouts = data.loggedWorkouts.filter(
                (lw) => lw.id !== b.dataset.dellog,
              );
              saveData();
              renderHistorico();
            }
          }),
        );
      }

      function formatDate(dateStr) {
        const d = new Date(dateStr + "T00:00:00");
        return d.toLocaleDateString("pt-PT", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }

      /* ===================== INIT ===================== */

      (async function initApp() {
        const cached = loadCache();
        if (cached && cached.token) {
          // arranque instantâneo com a cópia local, depois sincroniza em segundo plano
          authToken = cached.token;
          currentUsername = cached.username;
          data = Object.assign(defaultData(), cached.data || {});
          currentSettings = Object.assign(
            defaultSettings(),
            cached.settings || {},
          );
          applySettings(currentSettings);
          document.getElementById("headerUsername").textContent =
            currentUsername;
          document.getElementById("settingsUsername").textContent =
            currentUsername;
          showApp();
          setActiveTab("perfil");
          checkForSessionDraft();
          loadSocialState();

          try {
            const res = await apiLoad(authToken);
            data = Object.assign(defaultData(), res.data || {});
            currentSettings = Object.assign(
              defaultSettings(),
              res.settings || currentSettings,
            );
            applySettings(currentSettings);
            saveCache();
            refreshCurrentTab();
          } catch (err) {
            if (err.status === 401) {
              showToast("A tua sessão expirou. Inicia sessão novamente.");
              logout();
            } else {
              showToast(
                "Sem ligação ao servidor — a usar dados guardados localmente.",
              );
            }
          }
        } else {
          applySettings(currentSettings);
          showAuth();
        }
      })();
