const sliderTrack = document.querySelector(".slider-track");
const nextBtn = document.querySelector(".next-btn");
const prevBtn = document.querySelector(".prev-btn");
const bonusCards = document.querySelectorAll(".bonus-card");

if (sliderTrack && nextBtn && prevBtn && bonusCards.length > 0) {
    let sliderIndex = 0;
    const totalCards = bonusCards.length;

    const updateSlider = () => {
        const cardWidth = bonusCards[0].offsetWidth;
        sliderTrack.style.transform = `translateX(-${sliderIndex * cardWidth}px)`;
    };

    nextBtn.addEventListener("click", () => {
        sliderIndex = (sliderIndex + 1) % totalCards;
        updateSlider();
    });

    prevBtn.addEventListener("click", () => {
        sliderIndex = (sliderIndex - 1 + totalCards) % totalCards;
        updateSlider();
    });

    window.addEventListener("resize", updateSlider);
}

const heroButton = document.querySelector(".btn");
const priceListSection = document.querySelector("#service-price-list");

if (heroButton) {
    heroButton.addEventListener("click", () => {
        if (priceListSection) {
            priceListSection.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        window.location.href = "services.html#service-price-list";
    });
}

const pricingAccordion = document.querySelector("#pricing-accordion");
const pricingSections = window.pricingSectionsData;
const classLabels = ["1 класс", "2 класс", "3 класс", "4 класс", "5 класс"];
const numberFormatter = new Intl.NumberFormat("ru-RU");

const pickDiscountRule = (amount) => {
    if (amount < 5000) {
        return { discount: 0, step: 100 };
    }

    if (amount < 10000) {
        return { discount: 500, step: 100 };
    }

    if (amount < 50000) {
        return { discount: 1000, step: 500 };
    }

    if (amount < 150000) {
        return { discount: 2000, step: 500 };
    }

    return { discount: 5000, step: 1000 };
};

const formatAdjustedPrice = (value) => {
    if (!value || value.includes("%")) {
        return value;
    }

    return value.replace(/\d(?:[\d\s]*\d)?/g, (chunk) => {
        const amount = Number(chunk.replace(/\s+/g, ""));

        if (!Number.isFinite(amount)) {
            return chunk;
        }

        const { discount, step } = pickDiscountRule(amount);
        const discountedAmount = Math.max(0, amount - discount);
        const normalizedAmount = Math.floor(discountedAmount / step) * step;

        return numberFormatter.format(normalizedAmount);
    });
};

const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const cleanupCopy = (value) => String(value)
    .replaceAll("Багажние отделение", "Багажное отделение")
    .replaceAll("Передняя Полусфера", "Передняя полусфера")
    .replaceAll("Порог наружний", "Порог наружный")
    .replaceAll("расчитывается", "рассчитывается");

const renderPricingSection = (section, index) => {
    const rowsMarkup = section.rows.map((row) => {
        const cellsMarkup = row.prices.map((price, cellIndex) => (
            `<td data-label="${escapeHtml(classLabels[cellIndex] || `Класс ${cellIndex + 1}`)}">${escapeHtml(formatAdjustedPrice(price))}</td>`
        )).join("");

        return `
            <tr>
                <th scope="row">${escapeHtml(cleanupCopy(row.name))}</th>
                ${cellsMarkup}
            </tr>
        `;
    }).join("");

    const notesMarkup = section.notes.length > 0
        ? `
            <div class="pricing-notes">
                ${section.notes.map((note) => `<p class="pricing-note">${escapeHtml(cleanupCopy(note))}</p>`).join("")}
            </div>
        `
        : "";

    return `
        <details class="pricing-group"${index === 0 ? " open" : ""}>
            <summary>
                <span class="pricing-group__title">${escapeHtml(cleanupCopy(section.title))}</span>
                <span class="pricing-group__meta">
                    <span class="pricing-group__count">${section.rows.length} услуг</span>
                    <span class="pricing-group__icon" aria-hidden="true">+</span>
                </span>
            </summary>
            <div class="pricing-group__content">
                <div class="pricing-table-wrap">
                    <table class="service-pricing-table">
                        <thead>
                            <tr>
                                <th>Услуга</th>
                                ${classLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsMarkup}
                        </tbody>
                    </table>
                </div>
                ${notesMarkup}
            </div>
        </details>
    `;
};

if (pricingAccordion && Array.isArray(pricingSections) && pricingSections.length > 0) {
    pricingAccordion.innerHTML = pricingSections.map(renderPricingSection).join("");
}
