const serviceType = document.getElementById("service_type");
const primarySiteSection = document.getElementById("primary_site_section");
const oneTimeSection = document.getElementById("one_time_section");

const oneTimeSiteChoice = document.getElementById("one_time_site_choice");
const newSiteSection = document.getElementById("new_site_section");
const newSiteName = document.getElementById("new_one_time_site_name");

function updateServiceType() {
    if (serviceType.value === "regular") {
        primarySiteSection.classList.remove("d-none");
        oneTimeSection.classList.add("d-none");

        oneTimeSiteChoice.required = false;
        newSiteName.required = false;
    }

    if (serviceType.value === "one_time") {
        primarySiteSection.classList.add("d-none");
        oneTimeSection.classList.remove("d-none");

        oneTimeSiteChoice.required = true;
    }

    if (serviceType.value === "") {
        primarySiteSection.classList.add("d-none");
        oneTimeSection.classList.add("d-none");

        oneTimeSiteChoice.required = false;
        newSiteName.required = false;
    }
}

function updateNewSiteField() {
    if (oneTimeSiteChoice.value === "new") {
        newSiteSection.classList.remove("d-none");
        newSiteName.required = true;
    } else {
        newSiteSection.classList.add("d-none");

        newSiteName.required = false;
        newSiteName.value = "";
    }
}

serviceType.addEventListener("change", updateServiceType);
oneTimeSiteChoice.addEventListener("change", updateNewSiteField);

updateServiceType();
updateNewSiteField();

const questionsSection = document.getElementById("questions_section");
const questionsContainer = document.getElementById("questions_container");

function loadQuestions() {
    const selectedServiceType = serviceType.value;

    if (selectedServiceType === "") {
        questionsSection.classList.add("d-none");
        questionsContainer.innerHTML = "";
        return;
    }

    let questionsUrl = "/api/questions?service_type=" + encodeURIComponent(selectedServiceType);

    if (selectedServiceType === "regular") {
        const siteIdInput = document.querySelector('input[name="site_id"]');
        if (!siteIdInput || !siteIdInput.value) {
            return;
        }

        questionsUrl = questionsUrl + "&site_id=" + encodeURIComponent(siteIdInput.value);
    }

    fetch(questionsUrl).then(function (response) {
        return response.json();
    })
        .then(function (result) {
            questionsContainer.innerHTML = "";
            const questions = result.questions || [];

            if (questions.length === 0) {
                questionsSection.classList.add("d-none");
                return;
            }

            questionsSection.classList.remove("d-none");

            for (const question of questions) {
                const wrapper = document.createElement("div");
                wrapper.className = "mb-3";
                const label = document.createElement("label");
                label.className = "form-label";
                label.textContent = question.question_text;
                const input = document.createElement("input");

                input.className = "form-control";
                input.name = "question_" + question.id;

                if (question.answer_type === "number") {
                    input.type = "number";
                } else {
                    input.type = "text";
                }

                if (question.required === true) {
                    input.required = true;
                }

                wrapper.appendChild(label);
                wrapper.appendChild(input);

                questionsContainer.appendChild(wrapper);
            }
        })
        .catch(function (error) {
            console.error("Could not load questions:", error);
        });
}

serviceType.addEventListener("change", loadQuestions);
oneTimeSiteChoice.addEventListener("change", loadQuestions);
loadQuestions();