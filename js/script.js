const track = document.querySelector(".slider-track");
const nextBtn = document.querySelector(".next-btn");
const prevBtn = document.querySelector(".prev-btn");
const cards = document.querySelectorAll(".bonus-card");

let index = 0;
const totalCards = cards.length;

function updateSlider() {
    const cardWidth = cards[0].offsetWidth;

    track.style.transform = `translateX(-${index * cardWidth}px)`;
}

nextBtn.addEventListener("click", () => {
    index++;

    if (index >= totalCards) {
        index = 0;
    }

    updateSlider();
});

prevBtn.addEventListener("click", () => {
    index--;

    if (index < 0) {
        index = totalCards - 1;
    }

    updateSlider();
});

window.addEventListener("resize", updateSlider);