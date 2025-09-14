const steps = {
    start: {
        text: "Welcome to the Seedcracking Flowchart! Choose your path:",
        options: [
            { label: "Java Edition", next: "step1" },
            { label: "Bedrock Edition", next: "step2" }
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
            { label: "Can't", next: "step6" }
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
    },
    step11: {
        text: "Version?",
        options: [
            { label: "1.17-", next: "step12" },
            { label: "1.18+", next: "step99999" }
        ]
    },
    step12: {
        text: "Are there dungeons?",
        options: [
            { label: "Yes", next: "step13" },
            { label: "No", next: "step14" }
        ]
    },
    step13: {
        text: "!!dungeoncracker",
        options: [
            { label: "Didn't work/Not much info", next: "step14" }
        ]
    },
    step14: {
        text: "Are there structures?",
        options: [
            { label: "Yes", next: "step15" },
            { label: "No", next: "step16" }
        ]
    },
    step15: {
        text: "!!structurecracker",
        options: [
            { label: "Not much info/Didn't work", next: "step15" }
        ]
    },
    step16: {
        text: "Are there trees?",
        options: [
            { label: "Yes", next: "step17" },
            { label: "No", next: "step18" }
        ]
    },
    step17: {
        text: "!!treecracker",
        options: [
            { label: "Not much info/Didn't work", next: "step18" }
        ]
    },
    step18: {
        text: "Are there rivers?",
        options: [
            { label: "Yes", next: "step19" },
            { label: "No", next: "step20" }
        ]
    },
    step19: {
        text: "!!rivers",
        options: [
            { label: "Not much info/Didn't work", next: "step20" }
        ]
    },
    step20: {
        text: "Are there mesa bands?",
        options: [
            { label: "Yes", next: "step21" },
            { label: "No", next: "step22" }
        ]
    },
    step21: {
        text: "!!mesa_bands",
        options: [
            { label: "Not much info/Didn't work", next: "step22" }
        ]
    },
    step22: {
        text: "If there was not much info and there was end pillars visible, try !!pillars (Most structure crackers have a built in feature for this).",
        options: [
            { label: "Didn't work", next: "step23" }
        ]
    },
    step23: {
        text: "If there was not much info from the structures, did you see the loot?.",
        options: [
            { label: "Yes", next: "step24" },
            { label: "No", next: "step25" }
        ]
    },
    step24: {
        text: "Ask nicely in the Discord about the progress on Lootinator.",
        options: [
            { label: "Probably not in some time", next: "step25" }
        ]
    },
    step25: {
        text: "Ask nicely about how one would crack this in the MC@H Discord.",
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
