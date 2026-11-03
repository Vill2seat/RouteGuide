package com.routeguide.mvp

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test

class RoadGuideNavigationTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun bottomNavigationOpensAllFourMvpScreens() {
        composeRule.onNodeWithText("Начать прогулку").assertIsDisplayed()
        composeRule.onNodeWithText("Начать прогулку").performClick()
        composeRule.onNodeWithText("Запись маршрута пока не подключена.").assertIsDisplayed()

        composeRule.onNodeWithText("Анализ").performClick()
        composeRule.onNodeWithText("Нет данных для анализа.").assertIsDisplayed()

        composeRule.onNodeWithText("История").performClick()
        composeRule.onNodeWithText("История маршрутов пока пуста.").assertIsDisplayed()

        composeRule.onNodeWithText("Главная").performClick()
        composeRule.onNodeWithText("Отображение карты пока не подключено.").assertIsDisplayed()
    }
}
