const steps = {
    start: {
        text: "Welcome to the Seedcracking Flowchart! Choose your path:",
        options: [
            { label: "Is it Java?", next: "step1" },
            { label: "Is it Bedrock?", next: "step2" }
        ]
    },
    step1: {
        text: "Do you have the world on your computer?",
        options: [
            { label: "Yes", next: "step3" },
            { label: "No", next: "step5" }
        ]
    },
    step3: {
        text: "Try typing last /seed",
        options: [
            { label: "Didn't work.", next: "step4" }
        ]
    },
    step4: {
        text: "Pause the game. Open to LAN. Enable Cheats",
        options: [
            { label: "Can't", next: "step7" }
        ]
    },
    step5: {
        text: "Is it a server you can join on",
        options: [
            { label: "Yes", next: "step6" },
            { label: "No", next: "step7" }
        ]
    },
    step6: {
        text: "!!seedcrackerx or the last link in !!nbc",
        options: [
            { label: "Didn't work.", next: "step9" }
        ]
    },
    step7: {
        text: "Did you delete the world?",
        options: [
            { label: "Yes", next: "step8" },
            { label: "No", next: "step9" }
        ]
    },
    step8: {
        text: "Try github.com/juke32/nbtdatparse.py",
        options: [
            { label: "Didn't work", next: "step9" }
        ]
    },
    step9: {
        text: "Do you have screenshots/video's of the world?",
        options: [
            { label: "Yes", next: "step11" },
            { label: "No", next: "step10" }
        ]
    },
    step10: {
        text: "You can't crack a seed with a description alone.",
        end: true
    }
};

const stepDiv = document.getElementById("step");

function showStep(stepId) {
    const step = steps[stepId];
    if (!step) return;

    stepDiv.classList.remove("show");

    setTimeout(() => {
        stepDiv.innerHTML = `<h2>${step.text}</h2>`;

        if (step.end) {
            const restartBtn = document.createElement("button");
            restartBtn.textContent = "Restart";
            restartBtn.onclick = () => showStep("start");
            stepDiv.appendChild(restartBtn);
        } else {
            step.options.forEach(opt => {
                const btn = document.createElement("button");
                btn.textContent = opt.label;
                btn.onclick = () => showStep(opt.next);
                stepDiv.appendChild(btn);
            });
        }

        setTimeout(() => stepDiv.classList.add("show"), 50);
    }, 300);
}

const intro = document.getElementById("intro");
const continueBtn = document.getElementById("continueBtn");

continueBtn.addEventListener("click", () => {
    intro.style.animation = "fadeOut 0.6s forwards";
    setTimeout(() => {
        intro.style.display = "none";
        showStep("start");
    }, 600);

});
