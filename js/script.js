<<<<<<< HEAD
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
=======
const phoneCopyButton = document.querySelector(".phone-copy");

if (phoneCopyButton) {
    const phoneNumber = phoneCopyButton.dataset.copy;
    const originalLabel = phoneCopyButton.textContent.trim();

    const setCopiedState = () => {
        phoneCopyButton.classList.add("copied");
        phoneCopyButton.textContent = "\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e";

        window.setTimeout(() => {
            phoneCopyButton.classList.remove("copied");
            phoneCopyButton.textContent = originalLabel;
        }, 1400);
    };

    phoneCopyButton.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(phoneNumber);
            setCopiedState();
        } catch (error) {
            const fallbackInput = document.createElement("input");
            fallbackInput.value = phoneNumber;
            document.body.appendChild(fallbackInput);
            fallbackInput.select();
            document.execCommand("copy");
            fallbackInput.remove();
            setCopiedState();
        }
    });
}

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
const servicesPageLink = window.location.pathname.replace(/\\/g, "/").includes("/pages/")
    ? "services.html#service-price-list"
    : "pages/services.html#service-price-list";

if (heroButton) {
    heroButton.addEventListener("click", () => {
        if (priceListSection) {
            priceListSection.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        window.location.href = servicesPageLink;
    });
}

const pricingAccordion = document.querySelector("#pricing-accordion");
const pricingSections = window.pricingSectionsData;
const classLabels = [
    "\u0031 \u043a\u043b\u0430\u0441\u0441",
    "\u0032 \u043a\u043b\u0430\u0441\u0441",
    "\u0033 \u043a\u043b\u0430\u0441\u0441",
    "\u0034 \u043a\u043b\u0430\u0441\u0441",
    "\u0035 \u043a\u043b\u0430\u0441\u0441",
];
const numberFormatter = new Intl.NumberFormat("ru-RU");
const addToCartLabel = "\u0412 \u0437\u0430\u044f\u0432\u043a\u0443";

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
    .replaceAll("Р‘Р°РіР°Р¶РЅРёРµ РѕС‚РґРµР»РµРЅРёРµ", "Р‘Р°РіР°Р¶РЅРѕРµ РѕС‚РґРµР»РµРЅРёРµ")
    .replaceAll("РџРµСЂРµРґРЅСЏСЏ РџРѕР»СѓСЃС„РµСЂР°", "РџРµСЂРµРґРЅСЏСЏ РїРѕР»СѓСЃС„РµСЂР°")
    .replaceAll("РџРѕСЂРѕРі РЅР°СЂСѓР¶РЅРёР№", "РџРѕСЂРѕРі РЅР°СЂСѓР¶РЅС‹Р№")
    .replaceAll("СЂР°СЃС‡РёС‚С‹РІР°РµС‚СЃСЏ", "СЂР°СЃСЃС‡РёС‚С‹РІР°РµС‚СЃСЏ");

const renderPricingSection = (section, index) => {
    const normalizedSectionTitle = cleanupCopy(section.title);

    const rowsMarkup = section.rows.map((row) => {
        const normalizedRowName = cleanupCopy(row.name);
        const cellsMarkup = row.prices.map((price, cellIndex) => {
            const classLabel = cleanupCopy(classLabels[cellIndex] || `\u041a\u043b\u0430\u0441\u0441 ${cellIndex + 1}`);
            const formattedPrice = cleanupCopy(formatAdjustedPrice(price));
            const addButtonLabel = `\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c ${normalizedRowName}, ${classLabel} \u0432 \u0437\u0430\u044f\u0432\u043a\u0443`;

            return `
                <td data-label="${escapeHtml(classLabel)}">
                    <div class="pricing-cell">
                        <span class="pricing-cell__value">${escapeHtml(formattedPrice)}</span>
                        <button
                            class="pricing-add-button"
                            type="button"
                            data-cart-section="${escapeHtml(normalizedSectionTitle)}"
                            data-cart-service="${escapeHtml(normalizedRowName)}"
                            data-cart-class="${escapeHtml(classLabel)}"
                            data-cart-price="${escapeHtml(formattedPrice)}"
                            aria-label="${escapeHtml(addButtonLabel)}"
                        >${addToCartLabel}</button>
                    </div>
                </td>
            `;
        }).join("");

        return `
            <tr>
                <th scope="row">${escapeHtml(normalizedRowName)}</th>
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
                <span class="pricing-group__title">${escapeHtml(normalizedSectionTitle)}</span>
                <span class="pricing-group__meta">
                    <span class="pricing-group__count">${section.rows.length} \u0443\u0441\u043b\u0443\u0433</span>
                    <span class="pricing-group__icon" aria-hidden="true">+</span>
                </span>
            </summary>
            <div class="pricing-group__content">
                <div class="pricing-table-wrap">
                    <table class="service-pricing-table">
                        <thead>
                            <tr>
                                <th>\u0423\u0441\u043b\u0443\u0433\u0430</th>
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
>>>>>>> 0b95131 (Update project version)
